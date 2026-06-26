export function buildStoredDishImageUrls(fileKey: string) {
  return {
    imageUrl: `/uploads/dishes/${fileKey}-full.webp`,
    thumbnailUrl: `/uploads/dishes/${fileKey}-thumb.webp`
  };
}

export function buildDishImagePayload(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return {
      imageUrl: imageUrl ?? null,
      thumbnailUrl: null as string | null
    };
  }

  if (imageUrl.endsWith("-full.webp")) {
    return {
      imageUrl,
      thumbnailUrl: imageUrl.replace(/-full\.webp$/, "-thumb.webp")
    };
  }

  return {
    imageUrl,
    thumbnailUrl: null as string | null
  };
}
