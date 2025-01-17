/// <reference types="@vechain/connex" />
import {
    Certificate,
    addressUtils,
    CertificateData,
    HDKey,
} from '@vechain/sdk-core';

const mnemonicWords =
    'denial kitchen pet squirrel other broom bar gas better priority spoil cross';

const hdNode = HDKey.fromMnemonic(mnemonicWords.split(' '));

const firstAccount = hdNode.deriveChild(0);

const privateKey = firstAccount.privateKey!;
const address = addressUtils.fromPrivateKey(privateKey);

const mockedConnexSigner: Connex.Signer = {
    signTx() {
        return Promise.resolve({ txid: '0x1234', signer: address });
    },

    signCert(msg) {
        const newCertificate: CertificateData = {
            domain: ' localhost:3000',
            timestamp: 12341234,
            signer: address,
            payload: msg.payload,
            purpose: msg.purpose,
        };

        const signedCertificate =
            Certificate.of(newCertificate).sign(privateKey);

        return Promise.resolve({
            annex: {
                domain: newCertificate.domain,
                timestamp: newCertificate.timestamp,
                signer: newCertificate.signer,
            },
            signature: signedCertificate.signature || '',
        });
    },
};

export { mockedConnexSigner, hdNode, mnemonicWords, privateKey, address };
