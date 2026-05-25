export function generationMode() {
  return process.env.IMAGE_GENERATION_MODE === "live" ? "live" : "test";
}

export function isLiveGeneration() {
  return generationMode() === "live";
}

export function testImageUrl() {
  return (
    process.env.TEST_IMAGE_URL ||
    "https://dummyimage.com/1024x1024/7d7355/ffffff.png&text=Generated+AI+Image"
  );
}
