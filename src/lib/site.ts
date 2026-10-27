export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "Лакомка",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lakomkakhv.ru").replace(/\/$/, ""),
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ??
    "Новогодние подарки и наборы конфет с доставкой по Хабаровску",
  phone: "+7 (4212) 78 96 21",
  phoneHref: "+74212789621",
  email: "Klakomka2016@mail.ru",
  address: {
    country: "RU",
    region: "Хабаровский край",
    city: "Хабаровск",
    street: "ул. Карла Маркса, д. 186б",
    postalCode: "680031",
  },
  legalName: 'ООО Компания "Лакомка"',
  inn: "2724199105",
  ogImage: "/og-default.png", // положим позже; если файла нет — соцсети используют первую картинку
};