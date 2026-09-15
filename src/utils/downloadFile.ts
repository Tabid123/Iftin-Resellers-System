export const downloadBlobInBrowser = async (blob: Blob, fileName: string): Promise<void> => {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = blobUrl;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  await new Promise((resolve) => setTimeout(resolve, 300));

  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
};
