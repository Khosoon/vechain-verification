import type { TemplateResult } from 'lit';
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { Breakpoint, Colors } from '../../../constants';
import type { Theme, ThemeMode } from '../../../constants/theme';

@customElement('vwk-base-modal')
export class Modal extends LitElement {
    static override styles = css`
        .modal-container {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
        }

        .modal {
            position: absolute;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .modal.LIGHT {
            background-color: ${Colors.White};
            color: ${Colors.Dark};
        }

        .modal.DARK {
            background-color: ${Colors.Dark};
            color: ${Colors.LightGrey};
        }

        @media (max-width: ${Breakpoint.Mobile}px) {
            .modal {
                width: 100%;
                border-top-left-radius: 16px;
                border-top-right-radius: 16px;
                bottom: 0;
                left: 0;
                right: 0;
            }
        }

        @media (min-width: ${Breakpoint.Mobile}px) {
            .modal {
                width: 350px;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                border-radius: 16px;
            }
        }
    `;
    @property({ type: Boolean })
    open = false;
    @property()
    mode: ThemeMode = 'LIGHT';
    @property()
    theme: Theme = 'DEFAULT';

    @property({ type: Function })
    onClose = (): null => null;

    stopPropagation = (event: Event): void => {
        event.stopPropagation();
    };

    override render(): TemplateResult {
        if (!this.open) return html``;
        return html`
            <div class="modal-container" @click=${this.onClose}>
                <div
                    class="modal ${this.mode} ${this.theme}"
                    @click=${this.stopPropagation}
                >
                    <slot></slot>
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'vwk-base-modal': Modal;
    }
}