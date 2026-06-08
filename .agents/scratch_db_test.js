import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function run() {
  console.log("Running ES module simulation...");
  try {
    const generation = await db.aiImageGeneration.findFirst({
      where: { status: "COMPLETED" },
    });
    if (!generation) {
      console.log("No COMPLETED generation found.");
      return;
    }
    console.log("Found generation ID:", generation.id);

    const finalSelections = {
      orientation: "square",
      size: "12x12",
      frame: "none",
      frameColor: "black",
      effect: "none",
    };

    let parsed = {};
    try {
      parsed = JSON.parse(generation.metadata || "{}");
    } catch {
      parsed = {};
    }

    const nextMetadata = JSON.stringify({
      ...parsed,
      draft: false,
      generationType: "final",
      finalSelections: {
        ...(parsed.finalSelections || {}),
        ...finalSelections,
      },
    });

    console.log("Attempting database update...");
    const updated = await db.aiImageGeneration.update({
      where: { id: generation.id },
      data: {
        selectedForCart: true,
        metadata: nextMetadata,
      },
    });
    console.log("Update successful!", updated.id);
  } catch (err) {
    console.error("Prisma error simulated:", err);
  } finally {
    await db.$disconnect();
  }
}

run();
