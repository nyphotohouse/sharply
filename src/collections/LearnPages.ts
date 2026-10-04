import type { CollectionConfig } from "payload";
import slugify from "slugify";
import { relatedGearItemsField } from "~/payload-fields/custom-fields";
import { lexicalFirstParagraphText } from "~/server/payload/richtext";
import {
  createEditorialAfterChangeHook,
  createEditorialAfterDeleteHook,
} from "./editorial-revalidation";

export const LearnPages: CollectionConfig = {
  slug: "learn-pages",
  admin: {
    useAsTitle: "title",
  },
  access: {
    create: ({ req: { user } }) =>
      user?.role === "superadmin" || user?.role === "admin",
    read: ({ req: { user } }) =>
      user?.role === "superadmin" ||
      user?.role === "admin" ||
      user?.role === "editor",
    update: ({ req: { user } }) =>
      user?.role === "superadmin" ||
      user?.role === "admin" ||
      user?.role === "editor",
    delete: ({ req: { user } }) =>
      user?.role === "superadmin" || user?.role === "admin",
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
      name: "category",
      type: "select",
      defaultValue: "unassigned",
      options: [
        {
          label: "Basics",
          value: "basics",
        },
        {
          label: "[Unassigned]",
          value: "unassigned",
        },
      ],
      required: true,
      admin: {
        position: "sidebar",
        description: "The category of the page.",
      },
    },
    {
      name: "skill_level",
      type: "select",
      required: true,
      options: [
        {
          label: "Beginner",
          value: "beginner",
        },
        {
          label: "Intermediate",
          value: "intermediate",
        },
        {
          label: "Advanced",
          value: "advanced",
        },
      ],
      admin: {
        position: "sidebar",
        description: "The complexity level of the content.",
      },
    },
    {
      name: "unlisted",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Whether to unlist the page from the learn pages list (will still be accessible via its link).",
      },
    },
    {
      name: "title",
      type: "text",
      required: true,
      admin: {
        description: "The title of the page.",
      },
      access: {
        create: ({ req: { user } }) =>
          user?.role === "superadmin" ||
          user?.role === "admin" ||
          user?.role === "editor",
        update: ({ req: { user } }) =>
          user?.role === "superadmin" || user?.role === "admin",
      },
    },
    {
      name: "thumbnail",
      type: "upload",
      relationTo: "media",
      required: true,
      admin: {
        position: "sidebar",
        description:
          "The thumbnail for the page. Ratio should be around 5:2 (3:1 and 2:1 are also acceptable with some cropping).",
      },
    },
    {
      name: "thumbnail_credit",
      type: "text",
      admin: {
        position: "sidebar",
        description: "The credit for the thumbnail.",
      },
    },
    {
      name: "thumbnail_credit_link",
      type: "text",
      admin: {
        position: "sidebar",
        description: "The link to the credit for the thumbnail.",
      },
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      access: {
        read: () => true,
        update: () => false,
      },
      admin: {
        position: "sidebar",
        description: "Auto-generated from title.",
      },
    },
    // auto generating excerpt from content
    {
      name: "excerpt",
      type: "textarea",
      access: {
        read: () => true,
        update: () => false,
      },
      admin: {
        position: "sidebar",
        description: "The excerpt of the page. Auto-generated from content.",
      },
    },
    {
      name: "content",
      type: "richText",
      required: true,
    },
    {
      name: "read_next",
      label: "Read Next",
      type: "relationship",
      relationTo: "learn-pages",
      admin: {
        position: "sidebar",
        description:
          "Optionally recommend another published Learn page at the end of this article.",
      },
    },
    {
      name: "command_aliases",
      label: "Command Aliases",
      type: "array",
      required: true,
      fields: [
        {
          name: "alias",
          type: "text",
          required: true,
          validate: (value: unknown) => {
            if (typeof value !== "string" || value.trim().length === 0) {
              return "Alias is required";
            }
            const alias = value.trim();
            // allow only lowercase letters and hyphens (no spaces, numbers, or other chars)
            if (!/^[a-z-]+$/.test(alias)) {
              return "Use only lowercase letters and hyphens (no spaces or numbers)";
            }
            return true;
          },
          admin: {
            description:
              "Lowercase letters and hyphens only (no spaces or numbers), e.g. 'cleaning' or 'nikon-gear'",
          },
        },
      ],
      admin: {
        description:
          "These aliases can be used in /learn [alias or slug] command to access this page from Discord bot quickly. Include at least one.",
      },
    },
    relatedGearItemsField,
  ],

  hooks: {
    afterChange: [createEditorialAfterChangeHook("learn-pages")],
    afterDelete: [createEditorialAfterDeleteHook("learn-pages")],
    beforeValidate: [
      ({ data }) => {
        // generate slug from title
        if (data?.title) {
          data.slug = slugify(data.title, {
            lower: true,
            strict: true, // remove special chars
            trim: true,
          });
        }
        // generate excerpt from content
        if (data?.content) {
          try {
            const text = lexicalFirstParagraphText(data.content, {
              maxLength: 160,
            });
            data.excerpt = text;
          } catch {
            const contentString = JSON.stringify(data.content);
            data.excerpt = `${contentString.slice(0, 160)}...`;
          }
        }
        return data;
      },
    ],
  },
};
