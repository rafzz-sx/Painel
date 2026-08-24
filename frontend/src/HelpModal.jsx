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
          { emoji: '👤', name: 'Nome de Pessoa', desc: 'Perfis públicos no GitHub, menções em Diários Oficiais, Portal da Transparência e Sócios.' },
          { emoji: '🪪', name: 'CPF', desc: 'Validação algorítmica, Estado emissor (9º dígito) e link oficial da Receita Federal.' },
          { emoji: '🏢', name: 'CNPJ (Sócios & Empresa)', desc: 'Razão social, Quadro de Sócios (QSA), capital, endereço, situação e CNAE.' },
          { emoji: '📱', name: 'Telefone / Celular', desc: 'Operadora Anatel, DDD, estado, WhatsApp, Telegram, Truecaller e Sync.me.' },
          { emoji: '✉️', name: 'E-mail', desc: 'Foto e perfil do Gravatar, conta no GitHub, validação MX e anti-descartável.' },
          { emoji: '📮', name: 'CEP', desc: 'Endereço completo: rua, bairro, cidade, estado e coordenadas.' },
          { emoji: '🚗', name: 'Placa de Veículo', desc: 'Formato (Antigo/Mercosul) e estado de registro Denatran.' },
          { emoji: '🌐', name: 'IP', desc: 'País, estado, cidade, provedor, fuso horário e detecção de VPN/Proxy.' },
          { emoji: '🔗', name: 'Domínio (.br)', desc: 'Titular, CNPJ do proprietário pelo Registro.br, DNS e validade.' },
          { emoji: '🏦', name: 'Bancos, COMPE & PIX', desc: 'ISPB, compensação COMPE, SPI, Registrato Bacen e diretório PIX.' },
          { emoji: '📂', name: 'Base Local (Data Vault)', desc: 'Busca silenciosa em PDFs, planilhas CSV, TXT, JSON e SQL depositados no sistema.' },
          { emoji: '🌤️', name: 'Clima em Tempo Real', desc: 'Temperatura, sensação térmica, umidade e vento ao vivo via Open-Meteo.' },
          { emoji: '📈', name: 'Economia & Cripto', desc: 'SELIC, IPCA, CDI, Dólar, Euro e cotação de 13.000+ criptoativos.' },
          { emoji: '🗺️', name: 'IBGE & Demografia', desc: 'População oficial, microrregião, mesorregião e mapa interativo OSM.' },
          { emoji: '📦', name: 'NCM & ISBN', desc: 'Nomenclatura fiscal de produto e dados bibliográficos de livros.' },
        ],
      },
    ],
  },
  {
    id: 'automacoes',
    icon: '⚡',
    title: 'Quais automações estão disponíveis?',
    content: [
      {
        type: 'cards',
        items: [
          { emoji: '📋', name: 'Copiar Dossiê (WhatsApp)', desc: 'Gera um dossiê estruturado com emojis e seções pronto para colar no WhatsApp ou bloco de notas com 1 clique.' },
          { emoji: '📥', name: 'Gerar Relatório PDF', desc: 'Emite um relatório investigativo formal timbrado, pronto para impressão ou salvamento em PDF.' },
          { emoji: '🗺️', name: 'Mini-Mapa Interativo', desc: 'Exibe o mapa OpenStreetMap diretamente dentro do card com vista de satélite e rotas.' },
          { emoji: '⚡', name: 'Cópia Rápida por Campo', desc: 'Cada campo possui um botão de 1 toque para copiar chave PIX, telefone, CNPJ ou endereço.' },
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
            query: 'Nome de Pessoa (ex: Gabriel Pereira)',
            returns: ['Avatar/Foto e perfil público do GitHub', 'Biografia, empresa e localização', 'Link direto para Diários Oficiais dos Municípios (Querido Diário)', 'Link para Portal da Transparência do Governo Federal (Servidores / PEP)', 'Links de busca no Jusbrasil e Escavador'],
          },
          {
            query: 'CPF (ex: 123.456.789-00)',
            returns: ['CPF formatado', 'Validação algorítmica oficial dos dígitos', 'Estado e Região Fiscal emissora (1ª a 10ª Região da Receita Federal)', 'Link oficial para emissão do Comprovante de Situação Cadastral na Receita Federal'],
          },
          {
            query: 'CNPJ (ex: 12.345.678/0001-90)',
            returns: ['Razão social e nome fantasia', 'Quadro de Sócios e Administradores (QSA com nomes e cargos)', 'Capital social e porte', 'CNAE principal e natureza jurídica', 'Situação cadastral e data de abertura', 'Endereço completo, telefone e e-mail fiscal'],
          },
          {
            query: 'Telefone (ex: (11) 98765-4321)',
            returns: ['Número formatado e tipo de linha (Celular / Fixo)', 'Operadora provável (Vivo, Claro, TIM, Oi)', 'DDD, Estado e região', 'Link direto para WhatsApp (wa.me)', 'Link direto para Telegram (t.me)', 'Links OSINT para identificador de chamadas (Truecaller e Sync.me)', 'Possível chave PIX no formato internacional (+55)'],
          },
          {
            query: 'E-mail (ex: user@gmail.com)',
            returns: ['Provedor identificado (Gmail, Outlook, etc.)', 'Foto de perfil real e biografia (Gravatar)', 'Conta e avatar do GitHub associados', 'Contas e redes vinculadas', 'Alerta se o e-mail é temporário/descartável', 'Validação se o domínio tem servidor de e-mail ativo (MX)'],
          },
          {
            query: 'Placa (ex: ABC1D23)',
            returns: ['Formato identificado (Mercosul ou Antigo)', 'Placa formatada e equivalente antigo', 'Estado de primeiro registro (faixas oficiais do Denatran)'],
          },
          {
            query: 'IP (ex: 8.8.8.8)',
            returns: ['País, estado e cidade', 'Provedor de internet (ISP) e organização', 'Fuso horário e coordenadas GPS com link no Google Maps', 'Alerta se a conexão é Datacenter, Proxy ou VPN'],
          },
          {
            query: 'Domínio (ex: google.com.br)',
            returns: ['Status do registro e titular', 'Documento do proprietário no Registro.br', 'Servidores DNS e datas de criação e expiração'],
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
