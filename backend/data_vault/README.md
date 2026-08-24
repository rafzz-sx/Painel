# 📂 Data Vault — Base Local de Dados

Coloque aqui seus arquivos de banco de dados para que o sistema os leia automaticamente durante as consultas.

## Formatos Suportados

| Formato | Extensão | Descrição |
|---------|----------|-----------|
| PDF | `.pdf` | Documentos escaneados e relatórios (texto extraído via pypdf) |
| Texto | `.txt`, `.log` | Arquivos de texto simples |
| CSV | `.csv`, `.tsv` | Planilhas separadas por vírgula ou tabulação |
| JSON | `.json` | Dados estruturados em formato JSON |
| SQL | `.sql` | Dumps de banco de dados SQL |

## Como Funciona

1. **Arraste ou copie** qualquer arquivo suportado para esta pasta.
2. O sistema **lê automaticamente** todos os arquivos ao receber uma consulta.
3. Se encontrar dados correspondentes, exibe um card `📂 Base Local: [nome_do_arquivo]`.
4. Se **não encontrar** nenhuma correspondência, **não exibe nenhum aviso** ao usuário.

## Observações

- Subpastas **são** suportadas (busca recursiva).
- Arquivos muito grandes (>50MB) são ignorados para manter a performance.
- A busca é case-insensitive e ignora acentos para máxima cobertura.
- CPFs, telefones e placas são buscados com e sem máscara (ex: `123.456.789-00` e `12345678900`).
