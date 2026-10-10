# GAMA — Gestão Industrial · PRD

## Problem Statement
Sistema web corporativo multiempresa, multiusuário, modular, com controle rigoroso de acesso, autenticação por usuário/senha (sem e-mail), importação/exportação Excel, dashboards, relatórios PDF e auditoria. Primeiro módulo: INVENTÁRIO. Arquitetura preparada para novos módulos (Produção, Qualidade, Expedição, etc.).

## Architecture
- Backend: FastAPI + MongoDB (Motor async). Rotas sob `/api`. Auth JWT em cookie httpOnly + bcrypt.
- Arquivos backend: `server.py` (rotas), `auth.py` (hash/jwt), `models.py` (BaseDocument/PyObjectId), `engine.py` (motor de validação + mapeamento de colunas), `reports.py` (Excel openpyxl + PDF reportlab).
- Frontend: React + Vite + Tailwind + shadcn/ui. Tema industrial escuro. Recharts para gráficos. Axios withCredentials.
- Isolamento multiempresa por `company_id` em todas as coleções; permissões verificadas no backend.

## User Personas
- Administrador do Sistema (system_admin): cadastra empresas, gera chave, cria admin da empresa, exclui empresa, auditoria.
- Administrador da Empresa (company_admin): valida chave, cria usuários, define permissões, acessa módulos.
- Usuário comum: acesso conforme permissões liberadas.

## Credenciais seed
- system_admin: `admin` / `admin123`
- system_admin: `alan_teixeira` / `ifma2013`

## Implemented (2026-06)
- Autenticação por username + bcrypt, cookie httpOnly, controle de tentativas (lockout por username, 429 após 5 falhas), logout, redefinir senha, troca de senha no primeiro acesso.
- Multiempresa: cadastro de empresa com geração de chave SIGLA-CÓDIGO, visualização de chave restrita a system/company admin.
- Admin da empresa + validação de chave no primeiro acesso.
- Usuários: criação com login automático (nome+sobrenome, sem acento, sufixo único), senha inicial, matriz de permissões módulo→submódulo→permissão.
- Exclusão de empresa em cascata (system_admin, confirmação por nome, auditada).
- Módulo Inventário: Cadastros (Produtos, Endereços, Grupos de Inventário, Gatilhos), Registro de Inventários (lista + kanban), criação com código sequencial INV-000000.
- Importação Ponto de Corte e Coleta Física (Excel) com preview/validação de colunas e modal com scroll interno; regra Peso (UN→Peso Bruto, KG→Estoque disponível); SKU Físico = LEFT(cód barras,10).
- Motor de validação: CONTAGEM OK, SKU FALTANTE, SKU FORA DO SISTEMA, UD DUPLICADA, SEM ETIQUETA, posição correta/errada.
- Pendências: abas dinâmicas, gatilhos, resolução + status + data, grade tipo Excel (edição inline, copiar/colar, excluir).
- Dashboard do inventário (KPIs, % acuracidade, % posição, gráficos interativos), Resumo por Material, Dados Gerais, Pendências globais com Dias em Pendência.
- Exportação Excel real e Relatório PDF real. Auditoria de ações.

## Backlog / Próximos
- P1: Popular dashboard inicial do system_admin com widgets agregados (contagens de empresas/usuários/pendências).
- P2: Dividir `server.py` em routers por domínio.
- P2: Filtro cruzado total entre gráficos (clique em categoria filtra tabelas).
- P2: Processamento assíncrono para arquivos muito grandes (dezenas de milhares de linhas).
