import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconBase = { width: 24, height: 24 };

const IconClose = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const IconHelp = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

const IconChevron = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// ---------------------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------------------

const FAQ_SECTIONS = [
  {
    id: 'como',
    icon: '🔍',
    title: 'Como consultar dados aqui?',
    content: [
      {
        type: 'steps',
        items: [
          { step: 1, text: 'Faça login com seu e-mail e senha para acessar o painel.' },
          { step: 2, text: 'Digite o dado que quer consultar na barra de pesquisa (CPF, CNPJ, CEP, telefone, e-mail, placa, IP, etc.).' },
          { step: 3, text: 'Clique em "Pesquisar" ou pressione Enter. Os resultados aparecerão instantaneamente na área à direita.' },
        ],
      },
      {
        type: 'tip',
        text: 'Você pode pesquisar qualquer tipo de dado — o sistema detecta automaticamente o que você digitou e consulta todas as fontes disponíveis ao mesmo tempo.',
      },
    ],
  },
  {
    id: 'formatos',
    icon: '✏️',
    title: 'De que jeito tenho que escrever?',
    content: [
      {
        type: 'text',
        text: 'O sistema aceita dados com ou sem pontuação. Veja os formatos aceitos:',
      },
      {
        type: 'formats',
        items: [
          { label: 'CPF', examples: ['123.456.789-00', '12345678900'], hint: 'Com ou sem pontos e traço' },
          { label: 'CNPJ', examples: ['12.345.678/0001-90', '12345678000190'], hint: 'Com ou sem formatação' },
          { label: 'CEP', examples: ['01310-100', '01310100'], hint: 'Com ou sem hífen' },
          { label: 'Telefone', examples: ['(11) 98765-4321', '11987654321', '+55 11 98765-4321'], hint: 'Com DDD, com ou sem parênteses' },
          { label: 'E-mail', examples: ['usuario@gmail.com'], hint: 'Endereço de e-mail completo' },
          { label: 'Placa', examples: ['ABC-1234', 'ABC1D23', 'ABC1234'], hint: 'Antiga ou Mercosul' },
          { label: 'IP', examples: ['8.8.8.8', '187.45.200.1'], hint: 'Endereço IPv4' },
          { label: 'Domínio', examples: ['google.com.br', 'uol.com.br'], hint: 'URL do site sem http://' },
          { label: 'DDD', examples: ['11', '21', '85'], hint: 'Apenas 2 dígitos' },
        ],
      },
    ],
  },
  {
    id: 'oqueposso',
    icon: '📋',
    title: 'O que posso consultar?',
    content: [
      {
        type: 'cards',
        items: [
          { emoji: '🪪', name: 'CPF', desc: 'Validação, estado emissor da Receita Federal e dados públicos.' },
          { emoji: '🏢', name: 'CNPJ', desc: 'Razão social, sócios, capital, endereço, situação e atividades.' },
          { emoji: '📮', name: 'CEP', desc: 'Endereço completo: rua, bairro, cidade, estado e coordenadas.' },
          { emoji: '📱', name: 'Telefone / Celular', desc: 'Operadora, DDD, estado, links WhatsApp e Telegram.' },
          { emoji: '✉️', name: 'E-mail', desc: 'Gravatar (foto e perfil), provedor, validação e anti-descartável.' },
          { emoji: '🚗', name: 'Placa de Veículo', desc: 'Formato (Antigo/Mercosul) e estado de registro.' },
          { emoji: '🌐', name: 'IP', desc: 'País, estado, cidade, provedor, fuso horário e se é VPN/Proxy.' },
          { emoji: '🔗', name: 'Domínio (.br)', desc: 'Titular, CNPJ do dono, servidores DNS e validade.' },
          { emoji: '🏦', name: 'Código de Banco', desc: 'Nome completo e dados do banco pelo código.' },
          { emoji: '📦', name: 'NCM', desc: 'Nomenclatura Comum do Mercosul (código de produto).' },
          { emoji: '📚', name: 'ISBN', desc: 'Dados do livro: título, autor, editora.' },
          { emoji: '📅', name: 'Ano (Feriados)', desc: 'Lista de feriados nacionais por ano.' },
        ],
      },
    ],
  },
  {
    id: 'retorno',
    icon: '📊',
    title: 'O que retorna em cada consulta?',
    content: [
      {
        type: 'returns',
        items: [
          {
            query: 'CPF (ex: 123.456.789-00)',
            returns: ['CPF formatado', 'Validação (válido/inválido)', 'Estado emissor (Receita Federal)', 'Nome, situação e dados públicos (ReceitaWS)'],
          },
          {
            query: 'CNPJ (ex: 12.345.678/0001-90)',
            returns: ['Razão social e nome fantasia', 'Endereço completo', 'Capital social e porte', 'Natureza jurídica e CNAE', 'Situação cadastral e data de abertura', 'Telefone e e-mail de contato'],
          },
          {
            query: 'Telefone (ex: (11) 98765-4321)',
            returns: ['Número formatado', 'Tipo de linha (Celular / Fixo)', 'Operadora provável (Vivo, Claro, TIM, Oi)', 'DDD e Estado', 'Link direto para WhatsApp', 'Link direto para Telegram', 'Formato internacional (+55)', 'Possível chave PIX'],
          },
          {
            query: 'E-mail (ex: user@gmail.com)',
            returns: ['Provedor identificado (Gmail, Outlook, etc.)', 'Foto de perfil real (Gravatar)', 'Nome público e biografia', 'Redes sociais vinculadas', 'Alerta se e-mail é temporário/descartável', 'Validação do servidor de e-mail'],
          },
          {
            query: 'Placa (ex: ABC1D23)',
            returns: ['Formato identificado (Mercosul ou Antigo)', 'Placa formatada', 'Estado de primeiro registro (Denatran)'],
          },
          {
            query: 'IP (ex: 8.8.8.8)',
            returns: ['País, estado e cidade', 'Provedor de internet (ISP)', 'Fuso horário', 'Coordenadas GPS', 'Link do Google Maps', 'Alerta se é VPN/Proxy'],
          },
          {
            query: 'Domínio (ex: google.com.br)',
            returns: ['Status do registro', 'Titular e CNPJ do proprietário', 'Servidores DNS', 'Datas de registro, expiração e alteração'],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// HelpModal component
// ---------------------------------------------------------------------------

export default function HelpModal({ isOpen, onClose }) {
  const [activeSection, setActiveSection] = useState(null);
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.25 }
      );
      gsap.fromTo(
        modalRef.current,
        { opacity: 0, y: 30, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' }
      );
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(modalRef.current, {
      opacity: 0, y: 20, scale: 0.97, duration: 0.25,
      onComplete: onClose,
    });
  };

  const toggleSection = (id) => {
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <div
      ref={overlayRef}
      className="help-overlay"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        className="help-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="help-header">
          <div className="flex items-center gap-3">
            <div className="help-icon-wrap">
              <IconHelp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Central de Ajuda</h2>
              <p className="text-xs text-ink-dim mt-0.5">Tudo sobre como usar o painel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-ink-dim hover:text-ink p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {/* FAQ Sections */}
        <div className="help-body">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.id} className="help-section">
              <button
                type="button"
                className={`help-section-btn ${activeSection === section.id ? 'help-section-btn--active' : ''}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className="help-section-emoji">{section.icon}</span>
                <span className="flex-1 text-left text-sm font-medium text-ink">
                  {section.title}
                </span>
                <IconChevron
                  className={`w-4 h-4 text-ink-dim transition-transform duration-300 ${
                    activeSection === section.id ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {activeSection === section.id && (
                <div className="help-section-content">
                  {section.content.map((block, bi) => (
                    <div key={bi}>
                      {/* Steps */}
                      {block.type === 'steps' && (
                        <div className="help-steps">
                          {block.items.map((item) => (
                            <div key={item.step} className="help-step">
                              <span className="help-step-num">{item.step}</span>
                              <span className="text-sm text-ink/90">{item.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tip */}
                      {block.type === 'tip' && (
                        <div className="help-tip">
                          <span className="text-sm">💡</span>
                          <span className="text-sm text-ink/80">{block.text}</span>
                        </div>
                      )}

                      {/* Text */}
                      {block.type === 'text' && (
                        <p className="text-sm text-ink-dim mb-3">{block.text}</p>
                      )}

                      {/* Formats table */}
                      {block.type === 'formats' && (
                        <div className="help-formats">
                          {block.items.map((fmt) => (
                            <div key={fmt.label} className="help-format-row">
                              <div className="help-format-label">{fmt.label}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1.5 mb-1">
                                  {fmt.examples.map((ex) => (
                                    <code key={ex} className="help-format-example">{ex}</code>
                                  ))}
                                </div>
                                <p className="text-[11px] text-ink-faint">{fmt.hint}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Cards grid */}
                      {block.type === 'cards' && (
                        <div className="help-cards-grid">
                          {block.items.map((card) => (
                            <div key={card.name} className="help-card">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-base">{card.emoji}</span>
                                <span className="text-sm font-medium text-ink">{card.name}</span>
                              </div>
                              <p className="text-[11px] text-ink-dim leading-relaxed">{card.desc}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Returns list */}
                      {block.type === 'returns' && (
                        <div className="help-returns">
                          {block.items.map((ret) => (
                            <div key={ret.query} className="help-return-block">
                              <p className="text-xs font-mono text-primary/80 mb-2 font-medium">{ret.query}</p>
                              <ul className="help-return-list">
                                {ret.returns.map((r, ri) => (
                                  <li key={ri} className="help-return-item">
                                    <span className="help-return-dot" />
                                    <span className="text-[12px] text-ink/80">{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="help-footer">
          <p className="text-[11px] text-ink-faint text-center">
            Painel de Dados v2.0 — Todas as consultas usam dados públicos e APIs gratuitas
          </p>
        </div>
      </div>
    </div>
  );
}

export { IconHelp };
