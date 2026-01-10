const { PrismaClient } = require("@prisma/client");

async function inspect() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"
      }
    }
  });

  try {
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'id'
    `;
    
    console.log("Current 'id' column definition:");
    result.forEach(col => {
      console.log(`  Name: ${col.column_name}`);
      console.log(`  Type: ${col.data_type}`);
      console.log(`  Default: ${col.column_default}`);
      console.log(`  Nullable: ${col.is_nullable}`);
    });

    // Check if id has any sequence
    const seqResult = await prisma.$queryRaw`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_name LIKE 'User%'
    `;

    if (seqResult.length > 0) {
      console.log("\nSequences found:");
      seqResult.forEach(seq => {
        console.log(`  - ${seq.sequence_name}`);
      });
    }

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
