import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { menuItems } from './seedData/menuItems';
import { neighborhoods } from './seedData/neighborhoods';

const prisma = new PrismaClient();

export const ADMIN_TECNICO_ID = 1; // fixando ID para segurança de exclusão futura

async function main() {
  console.log('Iniciando seed...');

  // 1. Criar usuário "tecnico" TI
  const password = await bcrypt.hash('admin123', 12);
  const user = await prisma.user.upsert({
    where: { username: 'tecnico' },
    update: {},
    create: {
      username: 'tecnico',
      password,
      role: 'TI',
      approved: true
    }
  });

  console.log('--- AVISO IMPORTANTE ---');
  console.log('Usuário "tecnico" criado com senha "admin123". ESTA SENHA DEVE SER TROCADA IMEDIATAMENTE EM PRODUÇÃO!');
  console.log('------------------------');

  // 2. Configuração do Sistema
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      contactPhone: "31999990000",
      contactInstagram: "trailer.pedidos.demo",
      updatedBy: "seed"
    }
  });

  // 3. Cardápio (Phase 2)
  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { name: item.name },
      update: {},
      create: {
        name: item.name,
        category: item.category as any,
        price: item.price,
        description: (item as any).description || null,
        ingredients: (item as any).ingredients || [],
        requiredChoice: (item as any).requiredChoice || null,
        available: true,
        archived: false
      }
    });
  }
  
  // 4. Bairros (Phase 2)
  for (const neigh of neighborhoods) {
    await prisma.neighborhood.upsert({
      where: { name: neigh.name },
      update: {},
      create: {
        name: neigh.name,
        deliveryFee: neigh.deliveryFee,
        active: true
      }
    });
  }

  console.log('Seed finalizado com sucesso.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
