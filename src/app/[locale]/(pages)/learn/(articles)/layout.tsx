import LearnBreadcrumbs from "~/app/[locale]/(pages)/learn/_components/learn-breadcrumbs";
import LearnMobileArticleSheet, {
  type LearnMobileArticleGroup,
} from "~/app/[locale]/(pages)/learn/_components/learn-mobile-article-sheet";
import LearnSidebar from "~/app/[locale]/(pages)/learn/_components/learn-sidebar";
import { ScrollFadeGrid } from "~/app/[locale]/(pages)/learn/_components/scroll-fade-grid";
import { TableOfContents } from "~/components/rich-text/table-of-contents";
import { ScrollProgress } from "~/components/ui/skiper-ui/scroll-progress";
import type { LearnPage } from "~/payload-types";
import { getLearnPages } from "~/server/payload/service";

export const revalidate = 60 * 60;

const sortByCreationDate = <T extends { createdAt: string }>(items: T[]) => {
  return [...items].sort(
    (firstItem, secondItem) =>
      new Date(firstItem.createdAt).getTime() -
      new Date(secondItem.createdAt).getTime(),
  );
};

type LearnPageWithSlug = LearnPage & { slug: string };

const humanizeCategory = (category: string) => {
  const knownCategories: Record<string, string> = {
    learn: "Learn",
    basics: "Basics",
    unassigned: "Unassigned",
    "all-about-gear": "All About Gear",
  };
  const mappedCategory = knownCategories[category];
  if (mappedCategory) {
    return mappedCategory;
  }
  return category
    .split("-")
    .map((segment) => {
      if (!segment) {
        return segment;
      }
      const segmentFirstCharacter = segment.charAt(0);
      const restOfSegment = segment.slice(1);
      return `${segmentFirstCharacter.toUpperCase()}${restOfSegment}`;
    })
    .join(" ");
};

export default async function ArticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pages = await getLearnPages();
  const basicPages = pages.filter((page) => page.category === "basics");
  const unassignedPages = pages.filter(
    (page) => page.category === "unassigned",
  );

  const availablePages = pages.filter((page): page is LearnPageWithSlug =>
    Boolean(page.slug),
  );
  const pagesByCategory = availablePages.reduce<
    Record<string, LearnPageWithSlug[]>
  >((accumulator, page) => {
    const category = page.category || "unassigned";
    if (!accumulator[category]) {
      accumulator[category] = [];
    }
    accumulator[category].push(page);
    return accumulator;
  }, {});

  const preferredCategoryOrder = ["basics", "unassigned"];
  const orderedCategoryNames = [
    ...preferredCategoryOrder.filter((name) => pagesByCategory[name]),
    ...Object.keys(pagesByCategory)
      .filter((name) => !preferredCategoryOrder.includes(name))
      .sort((first, second) => first.localeCompare(second)),
  ];

  const mobileGroups = orderedCategoryNames
    .map((category) => {
      const categoryPages = pagesByCategory[category];
      if (!categoryPages?.length) {
        return null;
      }
      return {
        title: humanizeCategory(category),
        items: sortByCreationDate(categoryPages).map((page) => ({
          title: page.title,
          href: `/learn/${page.slug}`,
        })),
      };
    })
    .filter((group): group is LearnMobileArticleGroup => Boolean(group));

  const sections = [
    {
      title: "Basics",
      defaultOpen: true,
      items: sortByCreationDate(basicPages)
        .filter((page) => page.slug)
        .map((page) => ({
          title: page.title,
          href: `/learn/${page.slug}`,
        })),
    },
  ];

  const rootItems = sortByCreationDate(unassignedPages)
    .filter((page) => page.slug)
    .map((page) => ({
      title: page.title,
      href: `/learn/${page.slug}`,
    }));

  return (
    <>
      <ScrollProgress bottomOffset={300} />
      <LearnMobileArticleSheet groups={mobileGroups} />
      <div className="mx-auto min-h-screen max-w-[1500px] pb-48">
        <ScrollFadeGrid>
          <aside className="fixed top-24 left-6 z-20 hidden w-64 2xl:block">
            <div className="transition-opacity duration-200 group-data-[scrolled=true]/scroll-fade:opacity-55 hover:opacity-100 focus-within:opacity-100">
              <LearnSidebar data={{ sections, rootItems }} />
            </div>
          </aside>
          <section className="mx-auto w-full max-w-4xl p-6 py-12 sm:py-24 lg:p-0 lg:pt-8">
            <div
              aria-hidden="true"
              className="from-background via-background/80 pointer-events-none sticky top-16 z-10 -mb-6 hidden h-24 bg-gradient-to-b to-transparent opacity-0 transition-opacity duration-200 group-data-[scrolled=true]/scroll-fade:opacity-100 lg:block"
            />
            <LearnBreadcrumbs pages={pages} />
            <article
              id="learn-article"
              className="prose-img:rounded-md prose-h3:scroll-mt-20 prose-h2:mt-12 prose prose-h1:text-4xl prose-zinc dark:prose-invert prose-h2:text-2xl dark:prose-h2:text-2xl sm:prose:h2:text-4xl dark:sm:prose-h2:text-4xl prose-h1:scroll-mt-20 prose-h2:scroll-mt-20 prose-h4:scroll-mt-20 mx-auto max-w-none dark:opacity-90"
            >
              {children}
            </article>
          </section>
          <aside className="fixed top-24 right-6 z-20 hidden w-10 lg:block">
            <div className="relative pt-3.5">
              <TableOfContents contentSelector="#learn-article" />
            </div>
          </aside>
        </ScrollFadeGrid>
      </div>
    </>
  );
}
