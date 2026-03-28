# 🧪 Guia de Testes - HortiDelivery Lite

## Pré-requisitos

Antes de começar os testes, certifique-se de:
1. ✅ Executar todas as migrations
2. ✅ Executar o seed de dados
3. ✅ Criar um usuário admin no Supabase
4. ✅ Configurar as variáveis de ambiente

## 🏪 Teste 1: Gestão de Lojas

### Objetivo
Verificar se é possível criar, editar e gerenciar múltiplas lojas.

### Passos
1. Faça login em `/login`
2. Acesse `/admin/stores`
3. Clique em "Nova Loja"
4. Preencha os dados:
   - Nome: "Hortifruti do Bairro"
   - Slug: "hortifruti-bairro"
   - Descrição: "Os melhores produtos da região"
   - Telefone: "(11) 98765-4321"
5. Clique em "Criar"
6. Verifique se a loja aparece na lista
7. Clique em editar e altere o nome
8. Verifique se as alterações foram salvas

### Resultado Esperado
- ✅ Loja criada com sucesso
- ✅ Loja aparece na lista
- ✅ Edição funciona corretamente
- ✅ Slug é único (tente criar outra com mesmo slug)

## 📍 Teste 2: Zonas de Entrega

### Objetivo
Verificar a criação e gestão de zonas de entrega.

### Passos
1. Acesse `/admin/delivery-zones`
2. Selecione uma loja no dropdown
3. Clique em "Nova Zona"
4. Preencha:
   - Loja: Selecione a loja
   - Nome: "Centro"
   - Taxa: 5.00
   - Pedido mínimo: 20.00
5. Clique em "Criar"
6. Crie mais 2 zonas com valores diferentes
7. Teste editar uma zona
8. Teste desativar uma zona

### Resultado Esperado
- ✅ Zonas criadas com sucesso
- ✅ Zonas aparecem filtradas por loja
- ✅ Edição funciona
- ✅ Ativação/desativação funciona

## 🎟️ Teste 3: Sistema de Cupons

### Objetivo
Verificar criação e validação de cupons.

### Passos
1. Acesse `/admin/coupons`
2. Clique em "Novo Cupom"
3. Crie um cupom de porcentagem:
   - Código: "TESTE10"
   - Tipo: Porcentagem
   - Valor: 10
   - Pedido mínimo: 30.00
   - Máximo de usos: 10
4. Crie um cupom de valor fixo:
   - Código: "DESCONTO5"
   - Tipo: Valor Fixo
   - Valor: 5.00
   - Pedido mínimo: 20.00
5. Teste editar um cupom
6. Teste desativar um cupom

### Resultado Esperado
- ✅ Cupons criados com sucesso
- ✅ Códigos são únicos
- ✅ Edição funciona
- ✅ Ativação/desativação funciona

## 🛒 Teste 4: Fluxo Completo de Compra

### Objetivo
Testar o fluxo completo desde a seleção de produtos até a finalização.

### Passos
1. Acesse `/default` (ou o slug da sua loja)
2. Teste a busca de produtos:
   - Digite "tomate" na busca
   - Verifique se filtra corretamente
3. Teste o filtro por categoria:
   - Clique em uma categoria
   - Verifique se mostra apenas produtos daquela categoria
4. Adicione produtos ao carrinho:
   - Adicione 3 produtos diferentes
   - Teste aumentar e diminuir quantidades
5. Clique em "Ir p/ Checkout"
6. No checkout:
   - Preencha nome: "João Silva"
   - Preencha telefone: "(11) 99999-9999"
   - Selecione uma zona de entrega
   - Preencha endereço: "Rua das Flores, 123"
   - Digite um cupom: "TESTE10"
   - Clique em "Aplicar"
   - Verifique se o desconto foi aplicado
   - Verifique se a taxa de entrega foi adicionada
7. Clique em "Confirmar Pedido"
8. Verifique a tela de confirmação

### Resultado Esperado
- ✅ Busca funciona corretamente
- ✅ Filtro por categoria funciona
- ✅ Carrinho atualiza corretamente
- ✅ Cupom é validado e aplicado
- ✅ Taxa de entrega é calculada
- ✅ Total está correto
- ✅ Pedido é criado com sucesso
- ✅ Tela de confirmação aparece

## 📦 Teste 5: Rastreamento de Pedidos

### Objetivo
Verificar se o cliente consegue rastrear seus pedidos.

### Passos
1. Acesse `/track`
2. Digite o telefone usado no pedido: "(11) 99999-9999"
3. Clique em "Buscar"
4. Verifique se o pedido aparece
5. Verifique as informações:
   - Nome do cliente
   - Endereço
   - Status
   - Valor total
   - Data/hora

### Resultado Esperado
- ✅ Busca funciona
- ✅ Pedidos aparecem corretamente
- ✅ Informações estão completas
- ✅ Status está correto

## 👨‍💼 Teste 6: Dashboard Administrativo

### Objetivo
Verificar o painel administrativo e gestão de pedidos.

### Passos
1. Acesse `/admin`
2. Verifique os cards de resumo:
   - Receita concluída
   - A receber
3. Verifique o Kanban de pedidos:
   - Novos Pedidos
   - Separando
   - Na Rota
   - Concluído
4. Teste mover um pedido:
   - Clique em "Preparar 🍳" em um pedido pendente
   - Verifique se mudou para "Separando"
   - Clique em "Enviar Moto 🛵"
   - Verifique se mudou para "Na Rota"
   - Clique em "Entregue ✅"
   - Verifique se mudou para "Concluído"
5. Teste o botão de WhatsApp
6. Verifique se os valores são atualizados em tempo real

### Resultado Esperado
- ✅ Dashboard carrega corretamente
- ✅ Valores estão corretos
- ✅ Kanban funciona
- ✅ Mudança de status funciona
- ✅ Botão WhatsApp abre corretamente
- ✅ Atualização em tempo real funciona

## 📊 Teste 7: Analytics

### Objetivo
Verificar os relatórios e métricas.

### Passos
1. Acesse `/admin/analytics`
2. Verifique os KPIs:
   - Receita Total
   - Ticket Médio
   - Produtos
   - Entregues
3. Verifique "Status dos Pedidos"
4. Verifique "Pedidos por Dia"
5. Verifique "Top 5 Clientes"
6. Faça mais alguns pedidos e veja se os números atualizam

### Resultado Esperado
- ✅ KPIs estão corretos
- ✅ Gráficos aparecem
- ✅ Dados são precisos
- ✅ Atualiza com novos pedidos

## 🛍️ Teste 8: Gestão de Produtos

### Objetivo
Verificar a gestão de produtos e cestas.

### Passos
1. Acesse `/admin/basket`
2. Na aba "Produtos":
   - Clique em "Novo"
   - Crie um produto:
     - Nome: "Maçã Fuji"
     - Preço: 8.90
     - URL da imagem: (opcional)
     - Ativo: Sim
   - Clique em "Criar"
3. Teste editar o produto
4. Na aba "Cestas":
   - Clique em "Nova"
   - Crie uma cesta:
     - Nome: "Cesta Básica"
     - Preço: 35.00
     - Ativa: Sim
   - Expanda a cesta
   - Adicione produtos à cesta
   - Teste alterar quantidades
5. Teste excluir um produto (que não esteja em uso)

### Resultado Esperado
- ✅ Produto criado com sucesso
- ✅ Edição funciona
- ✅ Cesta criada com sucesso
- ✅ Produtos adicionados à cesta
- ✅ Quantidades atualizam
- ✅ Exclusão funciona (com validação)

## 🔍 Teste 9: Validações

### Objetivo
Verificar se as validações estão funcionando.

### Passos
1. No checkout, tente:
   - Enviar sem preencher nome
   - Enviar com telefone inválido
   - Enviar sem selecionar zona
   - Aplicar cupom inválido
   - Aplicar cupom expirado
   - Aplicar cupom com pedido abaixo do mínimo
2. Na criação de loja, tente:
   - Criar com slug duplicado
   - Criar sem nome
3. Na criação de cupom, tente:
   - Criar com código duplicado
   - Criar sem valor

### Resultado Esperado
- ✅ Validações aparecem
- ✅ Mensagens de erro são claras
- ✅ Não permite enviar com dados inválidos
- ✅ Feedback visual funciona

## 📱 Teste 10: Responsividade

### Objetivo
Verificar se o sistema funciona em diferentes dispositivos.

### Passos
1. Teste em desktop (1920x1080)
2. Teste em tablet (768x1024)
3. Teste em mobile (375x667)
4. Verifique:
   - Layout se adapta
   - Botões são clicáveis
   - Textos são legíveis
   - Imagens não quebram
   - Kanban tem scroll horizontal no mobile

### Resultado Esperado
- ✅ Layout responsivo
- ✅ Funciona em todos os tamanhos
- ✅ Sem quebras de layout
- ✅ Usabilidade mantida

## 🔄 Teste 11: Tempo Real

### Objetivo
Verificar se as atualizações em tempo real funcionam.

### Passos
1. Abra duas abas do navegador
2. Na primeira, acesse `/admin`
3. Na segunda, faça um pedido em `/default`
4. Volte para a primeira aba
5. Verifique se o pedido apareceu automaticamente
6. Mude o status do pedido
7. Verifique se atualiza em tempo real

### Resultado Esperado
- ✅ Novos pedidos aparecem automaticamente
- ✅ Mudanças de status atualizam em tempo real
- ✅ Sem necessidade de refresh

## 🎨 Teste 12: Landing Page

### Objetivo
Verificar a landing page e navegação.

### Passos
1. Acesse `/`
2. Verifique o design
3. Clique em "Rastrear Pedido"
4. Verifique se vai para `/track`
5. Volte e clique em "Explorar Lojas Locais"
6. Verifique se vai para a loja

### Resultado Esperado
- ✅ Landing page carrega
- ✅ Design está bonito
- ✅ Links funcionam
- ✅ Navegação está correta

## ✅ Checklist Final

Antes de considerar os testes completos, verifique:

- [ ] Todas as migrations foram executadas
- [ ] Seed foi executado com sucesso
- [ ] Usuário admin foi criado
- [ ] Variáveis de ambiente estão configuradas
- [ ] Lojas podem ser criadas e gerenciadas
- [ ] Zonas de entrega funcionam
- [ ] Cupons são validados corretamente
- [ ] Fluxo de compra completo funciona
- [ ] Rastreamento funciona
- [ ] Dashboard admin funciona
- [ ] Analytics mostra dados corretos
- [ ] Produtos podem ser gerenciados
- [ ] Validações estão funcionando
- [ ] Sistema é responsivo
- [ ] Tempo real funciona
- [ ] Landing page está ok

## 🐛 Reportando Bugs

Se encontrar algum problema:

1. Anote o erro exato
2. Anote os passos para reproduzir
3. Tire screenshots se possível
4. Verifique o console do navegador
5. Verifique os logs do Supabase
6. Abra uma issue com todas as informações

## 🎉 Conclusão

Se todos os testes passaram, parabéns! O sistema está funcionando perfeitamente e pronto para uso em produção! 🚀
