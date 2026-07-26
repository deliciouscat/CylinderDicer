const manifests = import.meta.glob('./*/manifest.json', {
    eager: true,
    import: 'default',
});
const imageUrls = import.meta.glob('./*/image.*', {
    eager: true,
    import: 'default',
});
const assetBundles = new Map();
for (const [manifestPath, manifest] of Object.entries(manifests)) {
    const folderName = manifestPath.match(/^\.\/([^/]+)\//)?.[1];
    if (!folderName) {
        continue;
    }
    const manifestFilePath = `./${folderName}/${manifest.file ?? 'image.webp'}`;
    const fallbackImagePath = Object.keys(imageUrls).find((path) => path.startsWith(`./${folderName}/`));
    const url = imageUrls[manifestFilePath] ?? (fallbackImagePath ? imageUrls[fallbackImagePath] : undefined);
    if (!url) {
        throw new Error(`Asset "${folderName}" has no image file`);
    }
    const bundle = {
        name: folderName,
        manifest,
        url,
    };
    assetBundles.set(folderName, bundle);
    if (manifest.id) {
        assetBundles.set(manifest.id, bundle);
    }
}
export function assetLoader(assetName) {
    const bundle = assetBundles.get(assetName);
    if (!bundle) {
        const availableAssets = [...assetBundles.keys()].sort().join(', ');
        throw new Error(`Unknown asset "${assetName}". Available assets: ${availableAssets}`);
    }
    return bundle;
}
