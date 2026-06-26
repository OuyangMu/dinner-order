import test from "node:test";
import assert from "node:assert/strict";
import { buildDishImagePayload, buildStoredDishImageUrls } from "./dish-image.js";

test("buildStoredDishImageUrls returns full and thumbnail urls for generated webp files", () => {
  assert.deepEqual(buildStoredDishImageUrls("demo-123"), {
    imageUrl: "/uploads/dishes/demo-123-full.webp",
    thumbnailUrl: "/uploads/dishes/demo-123-thumb.webp"
  });
});

test("buildDishImagePayload derives thumbnail url from generated full image url", () => {
  assert.deepEqual(buildDishImagePayload("/uploads/dishes/demo-123-full.webp"), {
    imageUrl: "/uploads/dishes/demo-123-full.webp",
    thumbnailUrl: "/uploads/dishes/demo-123-thumb.webp"
  });
});

test("buildDishImagePayload falls back to original image when thumbnail cannot be derived", () => {
  assert.deepEqual(buildDishImagePayload("/uploads/dishes/legacy-image.jpg"), {
    imageUrl: "/uploads/dishes/legacy-image.jpg",
    thumbnailUrl: null
  });
});
