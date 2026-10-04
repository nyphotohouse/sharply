import type { CollectionConfig } from "payload";
import slugify from "slugify";
import { GENRES } from "~/lib/constants";
import { reviewGearItemField } from "~/payload-fields/custom-fields";
import {
  createEditorialAfterChangeHook,
  createEditorialAfterDeleteHook,
} from "./editorial-revalidation";

export const Review: CollectionConfig = {
  slug: "review",
  admin: {
    useAsTitle: "title",
  },
  versions: {
    drafts: {
      autosave: true,
    },
    maxPerDoc: 4,
  },
  trash: true,
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      admin: {
        description: "The title of the review.",
      },
    },
    {
      name: "thumbnail",
      type: "upload",
      relationTo: "media",
      required: true,
      admin: {
        position: "sidebar",
        description: "The thumbnail of the review.",
      },
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description: "Auto-generated from title, can be overridden",
      },
    },
    reviewGearItemField,
    {
      name: "review_summary",
      label: "Review Summary",
      type: "textarea",
      required: true,
      maxLength: 600,
      minLength: 100,
      admin: {
        description:
          "A relatively short overview/summary/conclusion based on your experience and findings. You will go more in depth below about specific features. Keep this surface level, and focus on how it compares to both the competition and other relevant items from the same manufacturer. This will be shown as the description/excerpt of the review.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "goodPoints",
          label: "The Good",
          type: "array",
          fields: [
            {
              name: "goodNote",
              label: "Good Note",
              type: "text",
              required: true,
            },
          ],
          required: true,
          admin: {
            width: "50%",
            description:
              "Add some good things you discovered/experienced with the item.",
          },
        },
        {
          name: "badPoints",
          label: "The Bad",
          type: "array",
          fields: [
            {
              name: "badNote",
              label: "Bad Note",
              type: "text",
              required: true,
            },
          ],
          required: true,
          admin: {
            width: "50%",
            description:
              "Add some bad things you discovered/experienced with the item.",
          },
        },
      ],
    },
    {
      name: "reviewContent",
      label: "Your Experience",
      type: "richText",
      required: true,
      admin: {
        description:
          "This is where you can add a detailed explanation of how you used the item, your experience, and specific perks and flaws you found. Recommended structure: Start with a description of what you used it for, your first impression of the build quality and performance, and an explanation of how it worked for your needs/use case. Then discuss whether you would recommend this item to others, who you would recommended it to, and who it might not be right for.",
      },
    },
    {
      name: "genreRatings",
      label: "Genre Ratings",
      type: "group",
      admin: {
        description:
          "Provide ratings only for the genres that apply. Leave unselected when not applicable.",
      },
      fields: (GENRES as any[]).map((g) => ({
        name: ((g.slug as string) ?? (g.id as string))!,
        label: (g.name as string) ?? ((g.slug as string) || "Genre"),
        type: "radio",
        required: false,
        virtual: true,
        defaultValue: "0",
        options: [
          { label: "N/A", value: "0" },
          { label: "Underperforms", value: "1" },
          { label: "Acceptable", value: "2" },
          { label: "Excels", value: "3" },
        ],
        admin: {
          layout: "horizontal",
          description: g.description,
        },
      })),
    },
    // Canonical storage for genre ratings. Radios above are UI only; this holds { [genreSlug]: number }
    {
      name: "genreRatingsMap",
      label: "Genre Ratings (JSON)",
      type: "json",
      admin: {
        hidden: true,
      },
    },
    {
      name: "sourceLinks",
      type: "array",
      fields: [
        {
          name: "name",
          type: "text",
        },
        {
          name: "link",
          type: "text",
        },
      ],
      admin: {
        description: "Add any source links to the review.",
      },
    },

    // {
    //   name: "content",
    //   type: "richText",
    //   required: true,
    // },
    // relatedBrandField,
    // relatedGearItemsField,
  ],

  hooks: {
    afterChange: [createEditorialAfterChangeHook("review")],
    afterDelete: [createEditorialAfterDeleteHook("review")],
    beforeValidate: [
      ({ data }) => {
        if (data?.title && !data?.slug) {
          data.slug = slugify(data.title, {
            lower: true,
            strict: true, // remove special chars
            trim: true,
          });
        }
        return data;
      },
    ],
    // Persist genre ratings as a single JSON map
    beforeChange: [
      ({ data }) => {
        try {
          const map: Record<string, number> = {};
          const group = (data as any)?.genreRatings || {};
          (GENRES as any[]).forEach((g) => {
            const key = (g.slug as string) ?? (g.id as string);
            if (!key) return;
            const raw = group?.[key];
            if (raw !== undefined && raw !== null && String(raw).length > 0) {
              const n = Number.parseInt(String(raw), 10);
              map[key] = Number.isNaN(n) ? 0 : n;
            }
          });
          (data as any).genreRatingsMap = map;
          // Remove UI-only group from persisted document to avoid duplication
          delete (data as any).genreRatings;
        } catch (_) {
          // no-op: do not block save on mapping failure
        }
        return data;
      },
    ],
    // Hydrate the UI group from JSON map so the admin form displays current values
    afterRead: [
      ({ doc }) => {
        try {
          const map = (doc as any)?.genreRatingsMap || {};
          const group: Record<string, string> = {};
          (GENRES as any[]).forEach((g) => {
            const key = (g.slug as string) ?? (g.id as string);
            if (!key) return;
            const n = map?.[key];
            group[key] = n === undefined || n === null ? "0" : String(n);
          });
          (doc as any).genreRatings = group;
        } catch (_) {
          // ignore hydration errors
        }
        return doc;
      },
    ],
  },
};
