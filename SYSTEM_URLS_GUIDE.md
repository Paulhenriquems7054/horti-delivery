# 🗺️ Guia Completo de URLs e Funcionalidades do Sistema

## Visão Geral

O HortiDelivery é um sistema multi-tenant de delivery de hortifruti com três tipos de usuários:
- **Cliente**: Compra produtos das lojas
- **Admin (Dono da Loja)**: Gerencia sua loja, produtos, pedidos
- **Desenvolvedor**: Acesso técnico ao sistema

---

## 📱 URLs PÚBLICAS (Cliente)

### 1. Landing Page
**URL**: `/`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/`

**Funcionalidade**:
- Página inicial do sistema
- Apresenta o conceito do HortiDelivery
- Botão "Explorar Lojas Locais" redireciona para primeira loja disponível
- Não mostra mais o botão "Área do Empreendedor" (acesso controlado)

**Acesso**: Público, qualquer pessoa

---

### 2. Catálogo da Loja (Página de Compras)
**URL**: `/:slug`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste`

**Funcionalidade**:
- Catálogo de produtos da loja específica
- Cliente vê produtos disponíveis na cesta da semana
- Pode escolher produtos por peso (kg) ou unidade
- Adiciona produtos ao carrinho
- Vê prévia do carrinho com valores
- Busca e filtro por categoria
- Botão "Ir p/ Checkout" quando tem itens no carrinho

**Fluxo**:
1. Cliente seleciona produtos
2. Escolhe peso ou quantidade
3. Vê total calculado (apenas itens por peso)
4. Clica em "Ir p/ Checkout"

**Dados Exibidos**:
- Nome e descrição da loja
- Produtos com foto, nome, preço/kg
- Toggle "Por Unidade" / "Por Peso"
- Contador de itens selecionados
- Total estimado (apenas itens por peso)
- Aviso "A pesar" para itens por unidade

---

### 3. Checkout
**URL**: `/:slug` (mesma página, step "checkout")  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste` (após clicar em checkout)

**Funcionalidade**:
- Formulário de dados do cliente
- Seleção de bairro/zona de entrega
- Aplicação de cupom de desconto
- Cálculo de taxa de entrega
- Campo de observações
- Confirmação do pedido

**Campos**:
- Nome completo
- Telefone (WhatsApp)
- Endereço completo
- Bairro/Zona de entrega (dropdown)
- Cupom de desconto (opcional)
- Observações (opcional)

**Cálculos**:
- Subtotal (itens por peso)
- Taxa de entrega (baseada no bairro)
- Desconto (se cupom aplicado)
- Total final

---

### 4. Confirmação do Pedido
**URL**: `/:slug` (mesma página, step "confirmation")  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste` (após confirmar pedido)

**Funcionalidade**:
- Tela de sucesso do pedido
- Mostra todos os itens do pedido
- Exibe total pago
- Botão "Acompanhar Pedido em Tempo Real"
- Botão "Fazer Novo Pedido"

**Dados Exibidos**:
- ID do pedido
- Lista completa de itens
- Quantidade/peso de cada item
- Preço de cada item (ou "A pesar")
- Total do pedido
- Aviso sobre itens que serão pesados

---

### 5. Rastreamento Individual do Pedido
**URL**: `/:slug/pedido/:orderId?phone=xxx`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste/pedido/abc123?phone=11999999999`

**Funcionalidade**:
- Página dedicada ao acompanhamento do pedido específico
- Atualização em tempo real via Supabase Realtime
- Timeline visual do status
- Lista completa de itens do pedido
- Sem necessidade de login ou captcha

**Status Possíveis**:
1. **Recebido** (pending): Pedido foi recebido, aguardando confirmação
2. **Separando** (preparing): Loja está separando os produtos
3. **A Caminho** (delivering): Entregador está a caminho
4. **Entregue** (delivered): Pedido foi entregue

**Dados Exibidos**:
- Nome da loja
- ID do pedido
- Nome do cliente
- Endereço de entrega
- Data/hora do pedido
- Status atual (timeline visual)
- Lista de itens com preços
- Total do pedido
- Observações (se houver)
- Indicador de atualização em tempo real (bolinha verde)

**Atualização Automática**:
- Status muda instantaneamente quando admin atualiza
- Itens são atualizados quando admin pesa produtos
- Não precisa recarregar a página

---

### 6. Busca de Pedidos por Telefone
**URL**: `/:slug/rastrear`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste/rastrear`

**Funcionalidade**:
- Busca todos os pedidos de um telefone
- Usado quando cliente perde o link direto
- Mostra histórico de pedidos
- Atualização em tempo real de todos os pedidos

**Como Usar**:
1. Cliente digita o telefone usado no pedido
2. Clica em "Buscar"
3. Vê lista de todos os pedidos daquele telefone
4. Cada pedido mostra status atual

---

### 7. Rastreamento Global (Legado)
**URL**: `/track`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/track`

**Funcionalidade**:
- Busca de pedidos sem contexto de loja específica
- Funciona igual ao `/:slug/rastrear`
- Mantido para compatibilidade

---

## 🔐 URLs PROTEGIDAS (Admin - Dono da Loja)

### 8. Login / Criação de Loja
**URL**: `/login`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/login`

**Funcionalidade**:
- Login para donos de loja existentes
- Criação de nova loja (primeiro acesso)
- Autenticação via Supabase Auth

**Fluxo de Criação de Loja**:
1. Admin acessa `/login`
2. Preenche dados da loja:
   - Nome da loja
   - Slug (URL única)
   - Descrição
   - Email
   - Senha
3. Sistema cria loja e usuário admin
4. Redireciona para `/admin`

**Fluxo de Login**:
1. Admin acessa `/login`
2. Digita email e senha
3. Sistema autentica
4. Redireciona para `/admin`

**Importante**: 
- Este link deve ser fornecido diretamente aos donos de estabelecimento
- Não está mais visível na landing page pública
- Evita criação de lojas aleatórias

---

### 9. Painel Admin (Dashboard)
**URL**: `/admin`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin`

**Funcionalidade**:
- Dashboard principal do admin
- Menu com todas as funcionalidades
- Estatísticas rápidas
- Acesso a todas as áreas de gestão

**Menu**:
- 📦 Gerenciar Pedidos
- 🥬 Gerenciar Cesta
- 🎟️ Cupons de Desconto
- 🏪 Dados da Loja
- 📍 Zonas de Entrega
- 📊 Relatórios
- 🚚 Entrega Direta
- 🔍 Rastrear Pedido

**Acesso**: Requer autenticação (ProtectedRoute)

---

### 10. Gerenciar Pedidos
**URL**: `/admin` (seção de pedidos no dashboard)

**Funcionalidade**:
- Lista todos os pedidos da loja
- Filtros por status
- Atualização de status
- Visualização de detalhes
- Pesagem de itens vendidos por unidade

**Ações Disponíveis**:
- Ver detalhes do pedido
- Mudar status (pending → preparing → delivering → delivered)
- Pesar itens vendidos por unidade
- Adicionar observações
- Marcar como entregue

**Status que Admin Pode Definir**:
- Recebido (pending)
- Separando (preparing)
- A Caminho (delivering)
- Entregue (delivered)
- Cancelado (cancelled)

---

### 11. Gerenciar Cesta da Semana
**URL**: `/admin/basket`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/basket`

**Funcionalidade**:
- Criar/editar cesta da semana
- Adicionar/remover produtos
- Definir preços
- Ativar/desativar cesta
- Configurar modo de venda (peso/unidade/ambos)

**Ações**:
- Criar nova cesta
- Adicionar produtos à cesta
- Definir preço por kg
- Definir preço por unidade (se aplicável)
- Definir modo de venda: unit, weight, ou both
- Ativar cesta (apenas uma ativa por vez)
- Upload de fotos dos produtos

**Campos do Produto**:
- Nome
- Descrição
- Categoria
- Preço por kg
- Preço por unidade (opcional)
- Modo de venda (unit/weight/both)
- Foto
- Ativo/Inativo

---

### 12. Cupons de Desconto
**URL**: `/admin/coupons`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/coupons`

**Funcionalidade**:
- Criar cupons de desconto
- Definir valor ou percentual
- Definir validade
- Ativar/desativar cupons
- Ver uso dos cupons

**Tipos de Cupom**:
- Percentual (ex: 10% de desconto)
- Valor fixo (ex: R$ 5,00 de desconto)

**Configurações**:
- Código do cupom
- Tipo (percentual ou fixo)
- Valor
- Data de validade
- Limite de uso
- Ativo/Inativo

---

### 13. Dados da Loja
**URL**: `/admin/stores`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/stores`

**Funcionalidade**:
- Editar informações da loja
- Alterar nome, descrição
- Alterar slug (URL)
- Configurar horários
- Ativar/desativar loja

**Campos Editáveis**:
- Nome da loja
- Slug (URL única)
- Descrição
- Telefone de contato
- Endereço
- Horário de funcionamento
- Status (ativo/inativo)

---

### 14. Zonas de Entrega
**URL**: `/admin/delivery-zones`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/delivery-zones`

**Funcionalidade**:
- Criar zonas/bairros de entrega
- Definir taxa de entrega por zona
- Ativar/desativar zonas
- Gerenciar áreas de cobertura

**Configurações**:
- Nome do bairro/zona
- Taxa de entrega
- Tempo estimado
- Ativo/Inativo

---

### 15. Relatórios e Analytics
**URL**: `/admin/analytics`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/analytics`

**Funcionalidade**:
- Visualizar estatísticas de vendas
- Relatórios de pedidos
- Produtos mais vendidos
- Faturamento por período
- Gráficos e métricas

**Métricas**:
- Total de pedidos
- Faturamento total
- Ticket médio
- Produtos mais vendidos
- Pedidos por status
- Pedidos por período

---

### 16. Entrega Direta (Admin)
**URL**: `/admin/direct-delivery`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/admin/direct-delivery`

**Funcionalidade**:
- Gerenciar entregas diretas
- Criar pedidos de entrega
- Acompanhar status
- Gerenciar entregadores

---

## 🚚 URLs DO ENTREGADOR

### 17. Painel do Entregador
**URL**: `/:slug/delivery`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/teste/delivery`

**Funcionalidade**:
- Lista de entregas do dia
- Mapa de rotas
- Atualização de status
- Confirmação de entrega

**Ações**:
- Ver pedidos para entregar
- Marcar como "saiu para entrega"
- Marcar como "entregue"
- Ver endereço e telefone do cliente
- Ver itens do pedido

---

### 18. Rastreamento de Entrega Direta
**URL**: `/delivery-tracking`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/delivery-tracking`

**Funcionalidade**:
- Rastreamento de entregas diretas
- Status em tempo real
- Localização do entregador (futuro)

---

## 🔧 URLs ADMINISTRATIVAS (Desenvolvedor/SuperAdmin)

### 19. Super Admin
**URL**: `/superadmin`  
**Exemplo**: `https://horti-delivery-lite.vercel.app/superadmin`

**Funcionalidade**:
- Gerenciamento global do sistema
- Ver todas as lojas
- Estatísticas gerais
- Configurações do sistema
- Gerenciar usuários

**Acesso**: Requer permissões especiais

---

## 📊 Resumo por Tipo de Usuário

### 👤 CLIENTE
```
/                           → Landing page
/:slug                      → Catálogo da loja (compras)
/:slug/pedido/:orderId      → Rastreamento individual
/:slug/rastrear             → Busca por telefone
/track                      → Rastreamento global
```

### 🏪 ADMIN (Dono da Loja)
```
/login                      → Login/Criação de loja
/admin                      → Dashboard principal
/admin/basket               → Gerenciar cesta
/admin/coupons              → Cupons de desconto
/admin/stores               → Dados da loja
/admin/delivery-zones       → Zonas de entrega
/admin/analytics            → Relatórios
/admin/direct-delivery      → Entrega direta
```

### 🚚 ENTREGADOR
```
/:slug/delivery             → Painel do entregador
/delivery-tracking          → Rastreamento de entrega
```

### 🔧 DESENVOLVEDOR/SUPERADMIN
```
/superadmin                 → Painel super admin
```

---

## 🔄 Fluxos Completos

### Fluxo do Cliente (Compra)
```
1. / (Landing)
   ↓
2. /:slug (Catálogo)
   ↓ Seleciona produtos
3. /:slug (Checkout)
   ↓ Preenche dados
4. /:slug (Confirmação)
   ↓ Clica "Acompanhar"
5. /:slug/pedido/:orderId (Rastreamento)
```

### Fluxo do Admin (Gestão de Pedido)
```
1. /login
   ↓
2. /admin (Dashboard)
   ↓ Vê novo pedido
3. /admin (Gerenciar Pedidos)
   ↓ Muda status para "Separando"
4. /admin (Pesa itens por unidade)
   ↓ Muda status para "A Caminho"
5. /admin (Marca como "Entregue")
```

### Fluxo do Admin (Criação de Cesta)
```
1. /login
   ↓
2. /admin
   ↓
3. /admin/basket
   ↓ Cria nova cesta
4. /admin/basket
   ↓ Adiciona produtos
5. /admin/basket
   ↓ Ativa cesta
```

---

## 🔐 Controle de Acesso

### Rotas Públicas (Sem Autenticação)
- `/` - Landing
- `/:slug` - Catálogo da loja
- `/:slug/pedido/:orderId` - Rastreamento individual
- `/:slug/rastrear` - Busca por telefone
- `/track` - Rastreamento global
- `/login` - Login/Criação de loja
- `/:slug/delivery` - Painel do entregador
- `/delivery-tracking` - Rastreamento de entrega

### Rotas Protegidas (Requer Autenticação)
- `/admin` - Dashboard admin
- `/admin/*` - Todas as páginas admin
- `/superadmin` - Super admin

### Proteção Implementada
```typescript
<Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
```

---

## 🎯 Características Especiais

### Multi-Tenant
- Cada loja tem seu próprio slug único
- URLs são isoladas por loja: `/:slug`
- Dados são filtrados por `store_id`
- RLS (Row Level Security) no Supabase

### Realtime
- Status de pedidos atualiza automaticamente
- Cliente vê mudanças sem recarregar
- Usa Supabase Realtime (WebSockets)

### Venda Dual (Peso e Unidade)
- Produtos podem ser vendidos por kg ou unidade
- Cliente escolhe o modo de compra
- Itens por unidade são pesados depois pelo admin
- Preço final é atualizado após pesagem

### Segurança
- RLS no Supabase
- Autenticação via Supabase Auth
- Rotas protegidas no frontend
- Validação de dados no backend

---

## 📝 Notas para Desenvolvedores

### Estrutura de Rotas (App.tsx)
```typescript
<Routes>
  {/* Públicas */}
  <Route path="/" element={<Landing />} />
  <Route path="/login" element={<Login />} />
  <Route path="/track" element={<OrderTracking />} />
  
  {/* Admin (protegidas) */}
  <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
  <Route path="/admin/basket" element={<ProtectedRoute><AdminBasket /></ProtectedRoute>} />
  
  {/* Entregador */}
  <Route path="/:slug/delivery" element={<Delivery />} />
  
  {/* Cliente (rastreamento) */}
  <Route path="/:slug/pedido/:orderId" element={<CustomerTracking />} />
  <Route path="/:slug/rastrear" element={<OrderTracking />} />
  
  {/* Loja do cliente (última rota dinâmica) */}
  <Route path="/:slug" element={<Index />} />
</Routes>
```

### Ordem das Rotas
⚠️ **IMPORTANTE**: A rota `/:slug` deve ser a ÚLTIMA rota dinâmica, pois captura qualquer URL que não corresponda às rotas anteriores.

### Parâmetros de URL
- `:slug` - Identificador único da loja
- `:orderId` - ID do pedido
- `?phone=xxx` - Query param com telefone (rastreamento)

### Hooks Importantes
- `useStoreInfo(slug)` - Busca dados da loja
- `useActiveBasket(storeId)` - Busca cesta ativa
- `useCreateOrder()` - Cria novo pedido
- `useRealtimeOrder(orderId, phone)` - Rastreamento em tempo real

---

## 🚀 Próximas Funcionalidades (Roadmap)

### Para Cliente
- [ ] Histórico de pedidos (login opcional)
- [ ] Favoritar produtos
- [ ] Notificações push de status
- [ ] Avaliação de pedidos
- [ ] Chat com a loja

### Para Admin
- [ ] Dashboard com gráficos
- [ ] Exportar relatórios (PDF/Excel)
- [ ] Gestão de estoque
- [ ] Múltiplos entregadores
- [ ] Integração com pagamento online

### Para Sistema
- [ ] App mobile (React Native)
- [ ] API pública
- [ ] Webhooks
- [ ] Integração com WhatsApp
- [ ] Sistema de fidelidade

---

## 📞 Suporte

Para dúvidas sobre URLs ou funcionalidades:
- Consulte este guia
- Veja os arquivos de documentação específicos
- Verifique o código em `src/App.tsx` para rotas
- Consulte `src/pages/` para implementação das páginas
