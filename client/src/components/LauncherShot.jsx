const BASE = '/resources/screenshots'

/**
 * Renders a real screenshot of the launcher. The images are exported straight from the
 * app (1600x900), so they already contain the launcher's own title bar and window
 * controls - never wrap them in extra fake window chrome.
 */
export default function LauncherShot({ name, alt, priority = false, className = '' }) {
  return (
    <picture>
      <source srcSet={`${BASE}/${name}.webp`} type="image/webp" />
      <img
        src={`${BASE}/${name}.png`}
        alt={alt}
        width={1600}
        height={900}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className={`block h-auto w-full select-none ${className}`}
      />
    </picture>
  )
}
