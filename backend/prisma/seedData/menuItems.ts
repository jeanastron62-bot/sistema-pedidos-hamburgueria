export const menuItems = [
  // BEBIDAS
  { name: 'Coca-Cola (Lata)', category: 'BEBIDAS', price: "6.00" },
  { name: 'Guaraná (Lata)', category: 'BEBIDAS', price: "6.00" },
  { name: 'Coca-Cola (600ml)', category: 'BEBIDAS', price: "9.00" },
  { name: 'Coca-Cola (1L)', category: 'BEBIDAS', price: "12.00" },
  { name: 'Mate Couro (1L)', category: 'BEBIDAS', price: "10.00" },
  { name: 'Coca-Cola (2L)', category: 'BEBIDAS', price: "15.00" },
  { name: 'Fanta Laranja (2L)', category: 'BEBIDAS', price: "14.00" },
  { name: 'Mate Couro (2L)', category: 'BEBIDAS', price: "13.00" },
  { name: 'Heineken (Latão)', category: 'BEBIDAS', price: "12.00" },
  { name: 'Brahma (Latão)', category: 'BEBIDAS', price: "8.00" },
  { name: 'Água Mineral (500ml)', category: 'BEBIDAS', price: "3.00" },
  { name: 'Água com Gás (500ml)', category: 'BEBIDAS', price: "4.00" },
  { name: 'Suco (Consultar Sabores)', category: 'BEBIDAS', price: "6.00" },

  // HOT_DOGS
  { name: 'Cachorro Quente', category: 'HOT_DOGS', price: "12.00", ingredients: ["Pão", "Salsicha", "Molho de Tomate", "Milho", "Batata Palha"] },
  { name: 'Cachorro Quente Especial', category: 'HOT_DOGS', price: "16.00", ingredients: ["Pão", "2 Salsichas", "Mussarela", "Bacon", "Molho de Tomate", "Milho", "Batata Palha"] },
  { name: 'Super Dog', category: 'HOT_DOGS', price: "19.00", ingredients: ["Pão", "2 Salsichas", "Mussarela", "Bacon", "Molho de Tomate", "Milho", "Batata Palha"], requiredChoice: { label: "Escolha o queijo", options: ["Cheddar", "Catupiry"] } },

  // HAMBURGUERES
  { name: 'Hambúrguer', category: 'HAMBURGUERES', price: "14.00", ingredients: ["Pão", "Carne", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Salada', category: 'HAMBURGUERES', price: "14.00", ingredients: ["Pão", "Ovo", "Mussarela", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"], description: "Não contém carne" },
  { name: 'X-Burguer', category: 'HAMBURGUERES', price: "16.00", ingredients: ["Pão", "Carne", "Mussarela", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Misto', category: 'HAMBURGUERES', price: "17.00", ingredients: ["Pão", "Carne", "Mussarela", "Presunto", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Bacon', category: 'HAMBURGUERES', price: "21.00", ingredients: ["Pão", "Carne", "Bacon", "Mussarela", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Egg-Bacon', category: 'HAMBURGUERES', price: "22.00", ingredients: ["Pão", "Carne", "Ovo", "Bacon", "Mussarela", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Tudo', category: 'HAMBURGUERES', price: "24.00", ingredients: ["Pão", "2 Carnes", "Ovo", "Bacon", "Mussarela", "Presunto", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Duplo', category: 'HAMBURGUERES', price: "28.00", ingredients: ["Pão", "2 Carnes", "2 Ovos", "2 Bacon", "2 Mussarela", "2 Presunto", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },
  { name: 'X-Triplo', category: 'HAMBURGUERES', price: "33.00", ingredients: ["Pão", "3 Carnes", "3 Ovos", "3 Bacon", "3 Mussarela", "3 Presunto", "Creme de Maionese", "Milho", "Batata Palha", "Alface", "Tomate"] },

  // MACARRAO_NA_CHAPA
  { name: 'Macarrão na Chapa', category: 'MACARRAO_NA_CHAPA', price: "27.00", ingredients: ["Macarrão", "Bacon", "Presunto", "Mussarela", "Milho", "Cebola", "Pimentão", "Tomate"], requiredChoice: { label: "Escolha o molho", options: ["Molho de Alho", "Molho Shoyu", "Molho de Tomate"] } },

  // ACRESCIMOS
  { name: 'Cheddar', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Catupiry', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Mussarela', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Presunto', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Bacon', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Frango Desfiado', category: 'ACRESCIMOS', price: "5.00" },
  { name: 'Banana', category: 'ACRESCIMOS', price: "3.00" },
  { name: 'Uva Passas', category: 'ACRESCIMOS', price: "3.00" },
  { name: 'Ovo', category: 'ACRESCIMOS', price: "3.00" }
];
