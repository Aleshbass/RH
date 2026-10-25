/**
 * Demo films hosted on Cloudinary. Paste each video's delivery URL
 * (https://res.cloudinary.com/<cloud>/video/upload/...) and it appears where noted.
 * An empty string hides the player, so pages never show a broken video.
 */
export const MARKETING_VIDEOS = {
  /** Your Care page, and "Why patients choose Rehabify" on the landing page */
  patientDemo: "https://res.cloudinary.com/dubeogufg/video/upload/improved_rehabify_demo_patient_rr6pqa.mp4",
  /** For Physiotherapists page, and the Physiotherapists tab of "Tools for your practice" */
  physiotherapist: "https://res.cloudinary.com/dubeogufg/video/upload/Rehabify_for_Physiotherapists_music_vbvpic.mp4",
  /** For Clinics page, and the Clinics tab of "Tools for your practice" */
  clinic: "https://res.cloudinary.com/dubeogufg/video/upload/Rehabify_for_Clinics_music_sgonld.mp4",
  /** About us page (Rehabify launch film) */
  launchFilm: "https://res.cloudinary.com/dubeogufg/video/upload/Rehabify_Launch_Film_16x9_t6cbda.mp4",
} as const;

const UPLOAD = "/video/upload/";
const isCloudinaryVideo = (url: string) => url.includes("res.cloudinary.com") && url.includes(UPLOAD);
const withTransform = (url: string, transform: string) => url.replace(UPLOAD, `${UPLOAD}${transform}/`);

/**
 * The film to play, sized and encoded by Cloudinary per device: f_auto picks the codec the browser
 * plays best (H.264/HEVC on iPhone, VP9/AV1 elsewhere), q_auto the lowest size that still looks
 * right, and c_limit stops anything wider than the player ever needs.
 *  "full"    — with sound, for someone who pressed play
 *  "preview" — the muted loop: first 12 seconds, no audio track, smaller and eco quality, so a
 *              landing page visit downloads a fraction of the film
 */
export function cloudinaryVideo(videoUrl: string, variant: "full" | "preview" = "full") {
  if (!isCloudinaryVideo(videoUrl) || videoUrl.includes("f_auto")) return videoUrl;
  return withTransform(
    videoUrl,
    variant === "preview" ? "so_0,du_12,ac_none,w_960,c_limit,q_auto:eco,f_auto" : "w_1600,c_limit,q_auto,f_auto"
  );
}

/**
 * A still for the poster, resized and compressed (WebP/AVIF where supported). so_auto lets
 * Cloudinary pick a representative frame; a fixed early second can land on a black fade-in.
 */
export function cloudinaryPoster(videoUrl: string, width = 1280) {
  if (!isCloudinaryVideo(videoUrl)) return undefined;
  return withTransform(videoUrl, `so_auto,w_${width},c_limit,q_auto,f_auto`).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}
