import type {
    EngineTypes,
    ProposalTypes,
    SessionTypes,
} from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import type { SignClient } from '@walletconnect/sign-client/dist/types/client';
import type { WCSigner, WCSignerOptions } from '../types';
import { DefaultMethods } from '../constants';
import { DAppKitLogger } from './logger';
import { ethers } from 'ethers';
import { SignTypedDataOptions } from '../types/types';

interface SessionAccount {
    networkIdentifier: string;
    address: string;
    topic: string;
}

/**
 * Creates a new WalletConnect signer
 * @param options - The signer options. See {@link WCSignerOptions}
 * @returns A new {@link WCSigner}
 */
export const createWcSigner = ({
    genesisId,
    wcClient,
    web3Modal,
    onDisconnected,
}: WCSignerOptions): WCSigner => {
    const chainId = `vechain:${genesisId.slice(-32)}`;
    let session: SessionTypes.Struct | undefined;

    wcClient
        .get()
        .then((clientInstance) => {
            listenToEvents(clientInstance);
            restoreSession(clientInstance);
        })
        .catch(() => {
            throw new Error(`Failed to get the wallet connect sign client`);
        });

    /**
     * Ping the session when the window is focused
     * if (window) to prevent SSR errors
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (window) {
        window.onfocus = async (): Promise<void> => {
            if (session) {
                const signClient = await wcClient.get();
                await signClient.ping({ topic: session.topic });
            }
        };
    }

    // listen for session updates
    const listenToEvents = (_client: SignClient): void => {
        _client.on('session_update', ({ topic, params }): void => {
            DAppKitLogger.debug('wallet connect signer', 'session_update', {
                topic,
                params,
            });
            const { namespaces } = params;
            const _session = _client.session.get(topic);
            session = { ..._session, namespaces };
        });

        _client.on('session_delete', () => {
            onDisconnected();
            disconnect().catch(() => {
                throw new Error('Failed to disconnect');
            });
        });
    };

    // restore a session if undefined
    const restoreSession = (_client: SignClient): void => {
        if (typeof session !== 'undefined') return;

        DAppKitLogger.debug('wallet connect signer', 'restore session');
        const sessionKeys = _client.session.keys;

        for (const key of sessionKeys) {
            const _session = _client.session.get(key);
            const accounts = _session.namespaces.vechain.accounts;

            for (const acc of accounts) {
                if (acc.split(':')[1] === genesisId.slice(-32)) {
                    session = _session;
                    return;
                }
            }
        }
    };

    /**
     * Validates the requested account and network against a request
     * @param requestedAddress - The optional requested account address
     */
    const validateSession = (
        requestedAddress?: string,
    ): SessionAccount | undefined => {
        if (!session) return;
        DAppKitLogger.debug('wallet connect signer', 'validate session');

        const firstAccount = session.namespaces.vechain.accounts[0];

        const address = firstAccount.split(':')[2];
        const networkIdentifier = firstAccount.split(':')[1];

        // Return undefined if the network identifier doesn't match
        if (networkIdentifier !== genesisId.slice(-32)) return;

        // Return undefined if the address doesn't match
        if (
            requestedAddress &&
            requestedAddress.toLowerCase() !== address.toLowerCase()
        )
            return;

        return {
            address,
            networkIdentifier,
            topic: session.topic,
        };
    };

    const connect = async (): Promise<SessionTypes.Struct> => {
        DAppKitLogger.debug('wallet connect signer', 'connect');
        const signClient = await wcClient.get();

        const namespace: ProposalTypes.RequiredNamespace = {
            methods: Object.values(DefaultMethods),
            chains: [chainId],
            events: [],
        };

        try {
            const requiredNamespaces: Record<
                string,
                ProposalTypes.RequiredNamespace
            > = {
                vechain: namespace,
            };

            const res = await signClient.connect({
                requiredNamespaces,
            });

            if (res.uri) {
                await web3Modal.openModal({ uri: res.uri });
            }

            return await new Promise((resolve, reject) => {
                const endSubscription = web3Modal.subscribeModal((ev) => {
                    if (!ev.open) {
                        reject(new Error('User closed modal while connecting'));
                        endSubscription();
                    }
                });

                res.approval()
                    .then((newSession) => {
                        session = newSession;
                        endSubscription();
                        resolve(newSession);
                    })
                    .catch((e) => {
                        web3Modal.closeModal();
                        reject(e);
                    });
            });
        } catch (e) {
            console.error('wc connect failed', e);
            throw new Error(`wc connect failed`);
        }
    };

    const getSessionTopic = async (
        requestedAccount?: string,
    ): Promise<string> => {
        const validation = validateSession(requestedAccount);

        if (validation) return validation.topic;

        const newSession = await connect();

        return newSession.topic;
    };

    const makeRequest = async <T>(
        params: EngineTypes.RequestParams['request'],
        signer?: string,
    ): Promise<T> => {
        const sessionTopic = await getSessionTopic(signer);

        const signClient = await wcClient.get();

        return signClient.request({
            topic: sessionTopic,
            chainId,
            request: params,
        });
    };

    const signTx = async (
        message: Connex.Vendor.TxMessage,
        options: Connex.Signer.TxOptions,
    ): Promise<Connex.Vendor.TxResponse> => {
        return makeRequest<Connex.Vendor.TxResponse>({
            method: DefaultMethods.RequestTransaction,
            params: [{ message, options }],
        });
    };

    const signCert = async (
        message: Connex.Vendor.CertMessage,
        options: Connex.Signer.CertOptions,
    ): Promise<Connex.Vendor.CertResponse> => {
        return makeRequest<Connex.Vendor.CertResponse>({
            method: DefaultMethods.SignCertificate,
            params: [{ message, options }],
        });
    };

    const signTypedData = async (
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, unknown>,
        options?: SignTypedDataOptions,
    ): Promise<string> => {
        return makeRequest<string>({
            method: DefaultMethods.SignTypedData,
            params: [{ domain, types, value, options }],
        });
    };

    const disconnect = async (): Promise<void> => {
        if (!session) return;

        const topic = session.topic;
        session = undefined;

        const signClient = await wcClient.get();

        try {
            await signClient.disconnect({
                topic,
                reason: getSdkError('USER_DISCONNECTED'),
            });
        } catch (e) {
            console.error('SignClient.disconnect failed', e);
            throw new Error(`SignClient.disconnect failed`);
        }
    };

    const connectAccount = async (): Promise<string> => {
        if (!session) {
            session = await connect();
        }

        const vechainNamespace = session.namespaces.vechain;

        if (!vechainNamespace) {
            throw new Error(
                'Failed to create a vechain session with wallet connect',
            );
        }

        const firstAccount = vechainNamespace.accounts[0];

        try {
            return firstAccount.split(':')[2];
        } catch (e) {
            console.error('Failed to get account from session', e);
            throw new Error('Failed to get account from session');
        }
    };

    return {
        signTx,
        signCert,
        signTypedData,
        disconnect,
        genesisId,
        connect: connectAccount,
    };
};
