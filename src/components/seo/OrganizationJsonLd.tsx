import { SITE } from "@/lib/site";

export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    email: SITE.email,
    telephone: SITE.phone,
    taxID: SITE.inn,
    address: {
      "@type": "PostalAddress",
      addressCountry: SITE.address.country,
      addressRegion: SITE.address.region,
      addressLocality: SITE.address.city,
      streetAddress: SITE.address.street,
      postalCode: SITE.address.postalCode,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}