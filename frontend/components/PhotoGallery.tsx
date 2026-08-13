"use client";

import Image from "next/image";
import { useRef } from "react";

import type { Photo } from "@/types";

/**
 * Airbnb's gallery: one large photo carrying the composition, four smaller ones
 * alongside, and "Show all photos" opening the full set.
 *
 * `priority` on the first image tells Next to preload it — it's the largest
 * thing above the fold, so it's what the page's perceived speed is measured by.
 */
export function PhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[3/1] place-items-center rounded-card bg-line text-meta text-slate">
        No photos yet
      </div>
    );
  }

  const [cover, ...rest] = photos;
  const thumbnails = rest.slice(0, 4);

  return (
    <>
      <div className="relative grid gap-2 overflow-hidden rounded-card md:grid-cols-2 md:gap-2">
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="group relative aspect-[4/3] overflow-hidden md:aspect-auto md:h-[480px]"
          aria-label={`Open photo gallery for ${title}, ${photos.length} photos`}
        >
          <Image
            src={cover.url}
            alt={cover.caption ?? title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
          />
        </button>

        {thumbnails.length > 0 && (
          <div className="hidden grid-cols-2 gap-2 md:grid">
            {thumbnails.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => dialogRef.current?.showModal()}
                className="group relative h-[236px] overflow-hidden"
                aria-label={`Open photo ${index + 2} of ${photos.length}`}
              >
                <Image
                  src={photo.url}
                  alt={photo.caption ?? `${title} — photo ${index + 2}`}
                  fill
                  sizes="25vw"
                  className="object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.04]"
                />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="absolute bottom-5 right-5 rounded-full border border-ink/10 bg-paper/95 px-5 py-2.5 text-meta font-medium shadow-warm backdrop-blur-sm transition-shadow duration-300 hover:shadow-lift"
        >
          Show all {photos.length} photos
        </button>
      </div>

      {/* Native <dialog> again: focus trap, Escape to close, ::backdrop, all free. */}
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[92vh] w-[min(94vw,1000px)] rounded-card bg-paper p-0 shadow-lift backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper px-6 py-4">
          <h2 className="font-display text-title">{title}</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close gallery"
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-sand"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(92vh-65px)] space-y-3 overflow-y-auto p-6">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative aspect-[3/2] overflow-hidden rounded-input bg-line">
              <Image
                src={photo.url}
                alt={photo.caption ?? `${title} — photo ${index + 1}`}
                fill
                sizes="(max-width: 1000px) 94vw, 1000px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}
