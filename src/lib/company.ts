export const toKopecks = (rubles: number) => Math.round(rubles * 100);

export const COMPANY = {
  name: 'ООО Компания "Лакомка"',
  inn: "2724199105",
  ogrn: "1152724000978",
  address: "680031, Хабаровский край, г. Хабаровск, ул. Карла Маркса, д. 186б",
  phoneLandline: "+7 (4212) 78 96 21",
  phoneMobile: "+7 914 158 24 64",
  email: "Klakomka2016@mail.ru",
  whatsapp: "https://web.whatsapp.com/send/?phone=79141582464",
  max: "https://max.ru/u/f9LHodD0cOJg4EvnSb7cUdUogKqeA_9T8M_MuCXCPoxDbs7F3d9kBA5Lbuc",
  founded: 2015,
} as const;

export const DISCOUNTS = [
  { percent: 5,  from: toKopecks(50_000),  to: toKopecks(100_000) },
  { percent: 7,  from: toKopecks(100_001), to: toKopecks(300_000) },
  { percent: 8,  from: toKopecks(300_001), to: null },
  { percent: 10, from: 0, to: null, note: "при полной оплате" },
] as const;

export const DELIVERY = {
  freeThresholdKopecks: toKopecks(5_000),
} as const;

export const PAYMENT = {
  prepaymentPercent: 20,
  methods: ["Наличные", "Безналичный расчёт", "СБП"] as const,
} as const;