/** Client-side file for multipart upload when the user pasted export text. */
export function pastedTextAsImportFile(
  text: string,
  filename: string,
  type: string,
): File {
  return new File([text], filename, { type });
}
