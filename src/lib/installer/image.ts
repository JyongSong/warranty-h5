const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

/**
 * 업로드 전 사진 축소·재인코딩. 설치 완료 등록과 A/S 완료 등록이 같이 쓴다.
 *
 * imageOrientation 을 명시하는 이유: 이 옵션의 기본값은 명세가 "none" 에서
 * "from-image" 로 바뀐 적이 있어 WebView 버전마다 다르게 동작한다. 비워 두면
 * 어떤 기기에서는 세로로 찍은 사진이 눕는다. 게다가 canvas 재인코딩 과정에서
 * EXIF 가 통째로 사라지므로, 한 번 누워서 올라간 사진은 본사에서 되돌릴 방법이 없다.
 * 그래서 기기 기본값에 맡기지 않고 "EXIF 대로 세운다" 로 못박는다.
 *
 * 실패하면 원본을 그대로 돌려준다. 압축이 안 됐다고 기사가 제출 자체를 못 하게
 * 만들 수는 없기 때문인데, 대신 원본이 용량 제한을 넘으면 업로드 단계에서 걸린다.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
