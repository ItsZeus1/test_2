import type { ImportService } from "@/lib/store/types";

/**
 * v32 — the Mega catalog, built from the section and service pages the owner saved:
 * names, package sizes and USD prices, the customer fields a game asks for, and the region /
 * type options of gift cards and accounts (their sizes are added per region in the editor).
 * Games → instant · e-cards & ready accounts → vault · internet providers → manual.
 * Loaded on demand by the admin import box only, so it never ships to customers.
 */
export const MEGA_CATALOG: ImportService[] = [
 {
  "name": "PUBG Mobile",
  "nameAr": "ببجي موبايل",
  "iconTerm": "PUBG MOBILE",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Free Fire",
  "nameAr": "فري فاير",
  "iconTerm": "Free Fire",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Jawaker",
  "nameAr": "جواكر",
  "iconTerm": "Jawaker",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Call of Duty Mobile",
  "nameAr": "كول أوف ديوتي موبايل",
  "iconTerm": "Call of Duty Mobile",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "80 Points",
    "price": 1.47
   },
   {
    "sizeName": "400+20 Points",
    "price": 5.78
   },
   {
    "sizeName": "800+80 Points",
    "price": 11.03
   },
   {
    "sizeName": "2000+400 Points",
    "price": 27.3
   },
   {
    "sizeName": "3750+1250 Points",
    "price": 54.6
   }
  ],
  "customFields": [
   {
    "id": "f-mega479",
    "labelAr": "رقم لزبون ( واتساب)",
    "labelEn": "Contact number (WhatsApp)",
    "required": true
   }
  ]
 },
 {
  "name": "Free Fire Memberships",
  "nameAr": "عضويات فري فاير",
  "iconTerm": "Free Fire",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Clash of Clans",
  "nameAr": "كلاش أوف كلانس",
  "iconTerm": "Clash of Clans",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "80 مجوهرة",
    "price": 1.01
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 0.99 )",
    "price": 1.51
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 2.99 )",
    "price": 4.04
   },
   {
    "sizeName": "500 مجوهرة",
    "price": 5.05
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 3.99 )",
    "price": 5.05
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 4.99 )",
    "price": 6.06
   },
   {
    "sizeName": "التذكرة الذهبية",
    "price": 7.07
   },
   {
    "sizeName": "المناظر (سكنات القرية)",
    "price": 8.08
   },
   {
    "sizeName": "المظاهر (سكنات الملوك)",
    "price": 8.08
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 6.99 )",
    "price": 8.08
   },
   {
    "sizeName": "1200 مجوهرة",
    "price": 10.1
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 9.99 )",
    "price": 11.11
   },
   {
    "sizeName": "تذكرة الحدث",
    "price": 12.12
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 12.99 )",
    "price": 14.14
   },
   {
    "sizeName": "المظاهر (سكنات الملوك)",
    "price": 16.16
   },
   {
    "sizeName": "المناظر (سكنات القرية)",
    "price": 16.16
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 14.99 )",
    "price": 16.16
   },
   {
    "sizeName": "2500 مجوهرة",
    "price": 20.2
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 19.99 )",
    "price": 21.21
   }
  ],
  "customFields": [
   {
    "id": "f-mega14",
    "labelAr": "الايميل الذي تريد التفعيل عليه",
    "labelEn": "Email",
    "required": true
   },
   {
    "id": "f-mega397",
    "labelAr": "رقم للتواصل",
    "labelEn": "Contact number",
    "required": true
   }
  ]
 },
 {
  "name": "Brawl Stars",
  "nameAr": "براول ستارز",
  "iconTerm": "Brawl Stars",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "30 جوهرة",
    "price": 2.02
   },
   {
    "sizeName": "80 جوهرة",
    "price": 5.05
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 3.99 )",
    "price": 5.05
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 4.99 )",
    "price": 6.06
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 5.99 )",
    "price": 7.07
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 6.99 )",
    "price": 8.08
   },
   {
    "sizeName": "Brawl Pass",
    "price": 9.09
   },
   {
    "sizeName": "المظاهر (السكنات)",
    "price": 9.09
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 7.99 )",
    "price": 9.09
   },
   {
    "sizeName": "170 جوهرة",
    "price": 10.1
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 8.99 )",
    "price": 10.1
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 9.99 )",
    "price": 11.11
   },
   {
    "sizeName": "Pass Plus",
    "price": 13.13
   },
   {
    "sizeName": "المظاهر (السكنات)",
    "price": 16.16
   },
   {
    "sizeName": "360 جوهرة",
    "price": 20.2
   },
   {
    "sizeName": "Pass pro",
    "price": 25.25
   },
   {
    "sizeName": "950 جوهرة",
    "price": 50.5
   },
   {
    "sizeName": "2000 جوهرة",
    "price": 101
   }
  ],
  "customFields": [
   {
    "id": "f-mega16",
    "labelAr": "الايميل الذي تريد التفعيل عليه",
    "labelEn": "Email",
    "required": true
   },
   {
    "id": "f-mega398",
    "labelAr": "رقم للتواصل",
    "labelEn": "Contact number",
    "required": true
   }
  ]
 },
 {
  "name": "Clash Royale",
  "nameAr": "كلاش رويال",
  "iconTerm": "Clash Royale",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "80 جوهرة",
    "price": 1.01
   },
   {
    "sizeName": "500 جوهرة",
    "price": 5.05
   },
   {
    "sizeName": "التذكرة المصغره",
    "price": 6.06
   },
   {
    "sizeName": "1200 جوهرة",
    "price": 10.1
   },
   {
    "sizeName": "التذكرة الماسية",
    "price": 12.12
   },
   {
    "sizeName": "2500 جوهرة",
    "price": 20.2
   }
  ],
  "customFields": [
   {
    "id": "f-mega17",
    "labelAr": "الايميل الذي تريد التفعيل عليه",
    "labelEn": "Email",
    "required": true
   },
   {
    "id": "f-mega399",
    "labelAr": "رقم للتواصل",
    "labelEn": "Contact number",
    "required": true
   }
  ]
 },
 {
  "name": "Hay Day",
  "nameAr": "هاي داي",
  "iconTerm": "Hay Day",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "50+5 جوهرة",
    "price": 2.02
   },
   {
    "sizeName": "130+13 جوهرة",
    "price": 5.05
   },
   {
    "sizeName": "275+28 جوهرة",
    "price": 10.1
   },
   {
    "sizeName": "فارم باس",
    "price": 12.12
   },
   {
    "sizeName": "فارم باس بلاس",
    "price": 18.18
   },
   {
    "sizeName": "570+57 جوهرة",
    "price": 20.2
   }
  ],
  "customFields": [
   {
    "id": "f-mega18",
    "labelAr": "الايميل الذي تريد التفعيل عليه",
    "labelEn": "Email",
    "required": true
   },
   {
    "id": "f-mega400",
    "labelAr": "رقم للتواصل",
    "labelEn": "Contact number",
    "required": true
   }
  ]
 },
 {
  "name": "FC Mobile",
  "nameAr": "إف سي موبايل",
  "iconTerm": "EA SPORTS FC Mobile",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "Silver 99",
    "price": 1.21
   },
   {
    "sizeName": "Point 100",
    "price": 1.21
   },
   {
    "sizeName": "Silver 499",
    "price": 5.97
   },
   {
    "sizeName": "Point 520",
    "price": 5.97
   },
   {
    "sizeName": "Silver 999",
    "price": 11.82
   },
   {
    "sizeName": "Point 1070",
    "price": 11.82
   },
   {
    "sizeName": "Silver 1999",
    "price": 23.65
   },
   {
    "sizeName": "Point 2200",
    "price": 23.65
   },
   {
    "sizeName": "Silver 4999",
    "price": 59.12
   },
   {
    "sizeName": "Point 5750",
    "price": 59.12
   },
   {
    "sizeName": "Silver 9999",
    "price": 118.25
   },
   {
    "sizeName": "Point 12000",
    "price": 118.25
   }
  ],
  "customFields": [
   {
    "id": "f-mega19",
    "labelAr": "اي دي الاعب",
    "labelEn": "Player ID",
    "required": true
   },
   {
    "id": "f-mega294",
    "labelAr": "السيرفر",
    "labelEn": "Server",
    "required": true
   }
  ]
 },
 {
  "name": "eFootball",
  "nameAr": "إي فوتبول",
  "iconTerm": "eFootball",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "PUBG Prosperity Packs",
  "nameAr": "حزم الازدهار ببجي",
  "iconTerm": "PUBG MOBILE",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Pure Sniper",
  "nameAr": "بيور سنايبر",
  "iconTerm": "Pure Sniper",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "900 Gold",
    "price": 5.25
   },
   {
    "sizeName": "1900 Gold",
    "price": 10.71
   },
   {
    "sizeName": "4300 Gold",
    "price": 21.63
   },
   {
    "sizeName": "11000 Gold",
    "price": 54.6
   },
   {
    "sizeName": "24000 Gold",
    "price": 107.14
   }
  ]
 },
 {
  "name": "Honor of Kings",
  "nameAr": "هونر أوف كينغز",
  "iconTerm": "Honor of Kings",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "400 Token",
    "price": 5.15
   },
   {
    "sizeName": "800 Token",
    "price": 10.3
   },
   {
    "sizeName": "2400 Token",
    "price": 30.91
   },
   {
    "sizeName": "4000 Token",
    "price": 51.51
   },
   {
    "sizeName": "8000 Token",
    "price": 103.02
   }
  ]
 },
 {
  "name": "Merge Kingdoms",
  "nameAr": "ميرج كينغدمز",
  "iconTerm": "Merge Kingdoms",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "1$ ألماس",
    "price": 1.13
   },
   {
    "sizeName": "5$ ألماس",
    "price": 5.15
   },
   {
    "sizeName": "30$ ألماس",
    "price": 28.85
   },
   {
    "sizeName": "50$ ألماس",
    "price": 47.39
   },
   {
    "sizeName": "100$ ألماس",
    "price": 93.75
   }
  ]
 },
 {
  "name": "Last War",
  "nameAr": "لاست وور",
  "iconTerm": "Last War: Survival",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "شراء اي منتج بقيمة ( 0.99 )",
    "price": 1.53
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 3.99 )",
    "price": 5.1
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 4.99 )",
    "price": 6.12
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 9.99 )",
    "price": 11.22
   },
   {
    "sizeName": "WeeklyPass",
    "price": 19.38
   },
   {
    "sizeName": "Season Battle Pass",
    "price": 19.38
   },
   {
    "sizeName": "Dawn Fund",
    "price": 19.38
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 19.99 )",
    "price": 22.44
   },
   {
    "sizeName": "Super Monthly Pass",
    "price": 23.46
   },
   {
    "sizeName": "Overlord Growth Handbook",
    "price": 23.46
   }
  ],
  "customFields": [
   {
    "id": "f-mega29",
    "labelAr": "اي دي الاعب",
    "labelEn": "Player ID",
    "required": true
   },
   {
    "id": "f-mega435",
    "labelAr": "رقم للتواصل",
    "labelEn": "Contact number",
    "required": true
   }
  ]
 },
 {
  "name": "8 Ball Pool",
  "nameAr": "8 بول بول",
  "iconTerm": "8 Ball Pool",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "112000 Coins",
    "price": 2.06
   },
   {
    "sizeName": "110 Cash",
    "price": 2.06
   },
   {
    "sizeName": "256000 Coins",
    "price": 4.12
   },
   {
    "sizeName": "250 Cash",
    "price": 4.12
   },
   {
    "sizeName": "800000 Coins",
    "price": 10.3
   },
   {
    "sizeName": "800 Cash",
    "price": 10.3
   },
   {
    "sizeName": "2000 Cash",
    "price": 20.6
   },
   {
    "sizeName": "2000000 Coins",
    "price": 20.6
   }
  ]
 },
 {
  "name": "Lords Mobile",
  "nameAr": "لوردس موبايل",
  "iconTerm": "Lords Mobile",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "ألماس 195 ألماسة",
    "price": 2.25
   },
   {
    "sizeName": "بطاقة اسبوعية",
    "price": 2.25
   },
   {
    "sizeName": "ألماس 395 ألماسة",
    "price": 4.5
   },
   {
    "sizeName": "ألماس 785 ألماسة",
    "price": 8.39
   },
   {
    "sizeName": "ألماس 1179 ألماسة",
    "price": 14.32
   },
   {
    "sizeName": "ألماس 1964 ألماسة",
    "price": 23.53
   },
   {
    "sizeName": "ألماس 3928 ألماسة",
    "price": 47.06
   },
   {
    "sizeName": "ألماس 7857 ألماسة",
    "price": 93.1
   },
   {
    "sizeName": "ألماس 11785 ألماسة",
    "price": 139.14
   },
   {
    "sizeName": "ألماس 19642 ألماسة",
    "price": 232.23
   }
  ]
 },
 {
  "name": "Genshin Impact",
  "nameAr": "جينشن إمباكت",
  "iconTerm": "Genshin Impact",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "60 صلة زمنية",
    "price": 1.01
   },
   {
    "sizeName": "بركة قمر الويلكين",
    "price": 5.09
   },
   {
    "sizeName": "300+30 كريستالة",
    "price": 5.09
   },
   {
    "sizeName": "300+30 کرونال نيكسوس",
    "price": 5.09
   },
   {
    "sizeName": "980+110 كريستالة",
    "price": 15.29
   },
   {
    "sizeName": "980+110 کرونال نيكسوس",
    "price": 15.29
   },
   {
    "sizeName": "1980+260 كريستالة",
    "price": 30.59
   },
   {
    "sizeName": "1980+260 کرونال نيكسوس",
    "price": 30.59
   },
   {
    "sizeName": "3280+300 كريستالة",
    "price": 50.99
   },
   {
    "sizeName": "3280+600 کرونال نيكسوس",
    "price": 50.99
   },
   {
    "sizeName": "6480+1600 كريستالة",
    "price": 101.99
   },
   {
    "sizeName": "6480+1600 کرونال نيكسوس",
    "price": 101.99
   }
  ],
  "customFields": [
   {
    "id": "f-mega32",
    "labelAr": "اي دي الاعب",
    "labelEn": "Player ID",
    "required": true
   },
   {
    "id": "f-mega310",
    "labelAr": "السيرفر",
    "labelEn": "Server",
    "required": true
   },
   {
    "id": "f-mega597",
    "labelAr": "اسم الشخصية بالعبة",
    "labelEn": "Character name",
    "required": true
   }
  ]
 },
 {
  "name": "Whiteout Survival",
  "nameAr": "وايت آوت سرفايفل",
  "iconTerm": "Whiteout Survival",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "99 ألماسة",
    "price": 1.36
   },
   {
    "sizeName": "299 ألماسة",
    "price": 4.08
   },
   {
    "sizeName": "499 ألماسة",
    "price": 5.54
   },
   {
    "sizeName": "999 ألماسة",
    "price": 10.98
   },
   {
    "sizeName": "1999 ألماسة",
    "price": 22.27
   },
   {
    "sizeName": "4999 ألماسة",
    "price": 54.89
   },
   {
    "sizeName": "9999 ألماسة",
    "price": 109.78
   }
  ]
 },
 {
  "name": "Mobile Legends",
  "nameAr": "موبايل ليجندز",
  "iconTerm": "Mobile Legends: Bang Bang",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": []
 },
 {
  "name": "Kingshot",
  "nameAr": "كينغ شوت",
  "iconTerm": "Kingshot",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "شراء اي منتج بقيمة ( 2.99 )",
    "price": 4.08
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 4.99 )",
    "price": 6.12
   },
   {
    "sizeName": "Construction & March Queues",
    "price": 8.16
   },
   {
    "sizeName": "Ultra Value Monthly Card",
    "price": 10.2
   },
   {
    "sizeName": "Hero Rally",
    "price": 10.2
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 9.99 )",
    "price": 11.22
   },
   {
    "sizeName": "Honor Fund",
    "price": 20.4
   },
   {
    "sizeName": "شراء اي منتج بقيمة ( 19.99 )",
    "price": 22.44
   }
  ]
 },
 {
  "name": "Monster Hunter Outlanders",
  "nameAr": "مونستر هنتر أوتلاندرز",
  "iconTerm": "Monster Hunter Outlanders",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "60",
    "price": 0.93
   },
   {
    "sizeName": "300",
    "price": 4.92
   },
   {
    "sizeName": "980",
    "price": 14.23
   },
   {
    "sizeName": "1280",
    "price": 19.4
   },
   {
    "sizeName": "1980",
    "price": 28.05
   },
   {
    "sizeName": "3280",
    "price": 47.22
   },
   {
    "sizeName": "6480",
    "price": 97.01
   }
  ]
 },
 {
  "name": "Blood Strike",
  "nameAr": "بلود سترايك",
  "iconTerm": "Blood Strike",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "100+5 Gold",
    "price": 0.88
   },
   {
    "sizeName": "300+20 Gold",
    "price": 2.7
   },
   {
    "sizeName": "Pass Elite",
    "price": 3.31
   },
   {
    "sizeName": "500+40 Gold",
    "price": 4.13
   },
   {
    "sizeName": "Pass Premium",
    "price": 7.48
   },
   {
    "sizeName": "1000+100 Gold",
    "price": 8.27
   },
   {
    "sizeName": "2000+260 Gold",
    "price": 16.56
   },
   {
    "sizeName": "5000+800 Gold",
    "price": 41.5
   }
  ]
 },
 {
  "name": "Delta Force Mobile",
  "nameAr": "دلتا فورس موبايل",
  "iconTerm": "Delta Force",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "60+Bouns",
    "price": 1.03
   },
   {
    "sizeName": "300+Bouns",
    "price": 4.64
   },
   {
    "sizeName": "420+Bouns",
    "price": 6.18
   },
   {
    "sizeName": "680+Bouns",
    "price": 8.14
   },
   {
    "sizeName": "1280+Bouns",
    "price": 17.51
   },
   {
    "sizeName": "1680+Bouns",
    "price": 21.63
   },
   {
    "sizeName": "3280+Bouns",
    "price": 44.3
   },
   {
    "sizeName": "6480+Bouns",
    "price": 86.54
   },
   {
    "sizeName": "12960+Bouns",
    "price": 195.74
   },
   {
    "sizeName": "19440+Bouns",
    "price": 283.31
   }
  ]
 },
 {
  "name": "Arena Breakout",
  "nameAr": "أرينا بريك آوت",
  "iconTerm": "Arena Breakout",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "60+6Bonds",
    "price": 0.82
   },
   {
    "sizeName": "310+25Bonds",
    "price": 4.15
   },
   {
    "sizeName": "630+45Bonds",
    "price": 8.3
   },
   {
    "sizeName": "1580+110Bonds",
    "price": 20.74
   },
   {
    "sizeName": "3200+200Bonds",
    "price": 41.55
   },
   {
    "sizeName": "6500+320Bonds",
    "price": 82.96
   }
  ]
 },
 {
  "name": "PUBG Mobile Vietnam",
  "nameAr": "ببجي فيتنام",
  "iconTerm": "PUBG MOBILE VN",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "56UC+BounsVN",
    "price": 1.35
   },
   {
    "sizeName": "140UC+BounsVN",
    "price": 2.58
   },
   {
    "sizeName": "280UC+BounsVN",
    "price": 5.05
   },
   {
    "sizeName": "560UC+BounsVN",
    "price": 10.21
   },
   {
    "sizeName": "1400UC+BounsVN",
    "price": 24.68
   },
   {
    "sizeName": "2800UC+BounsVN",
    "price": 49.37
   }
  ]
 },
 {
  "name": "Asphalt Legends",
  "nameAr": "أسفلت ليجندز",
  "iconTerm": "Asphalt Legends",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "Token Pack 1 (40 tokens)",
    "price": 0.92
   },
   {
    "sizeName": "Token Pack 2 (105 tokens)",
    "price": 2.31
   },
   {
    "sizeName": "Token Pack 3 (220 tokens)",
    "price": 4.39
   },
   {
    "sizeName": "Token Pack 4 (470 tokens",
    "price": 9.02
   },
   {
    "sizeName": "Token Pack 5 (1275 tokens)",
    "price": 22.91
   }
  ],
  "customFields": [
   {
    "id": "f-mega607",
    "labelAr": "اي دي الاعب",
    "labelEn": "Player ID",
    "required": true
   },
   {
    "id": "f-mega608",
    "labelAr": "رابط الجهاز",
    "labelEn": "Device link",
    "required": true
   }
  ]
 },
 {
  "name": "Yalla Ludo",
  "nameAr": "يلا لودو",
  "iconTerm": "Yalla Ludo",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "2230 ألماس",
    "price": 4.76
   },
   {
    "sizeName": "5150 ألماس",
    "price": 9.74
   }
  ]
 },
 {
  "name": "Tarbi3a",
  "nameAr": "تربيعة",
  "iconTerm": "تربيعة",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "32800 TopUp",
    "price": 1.38
   },
   {
    "sizeName": "94300 TopUp",
    "price": 3.88
   },
   {
    "sizeName": "215800 TopUp",
    "price": 7.75
   },
   {
    "sizeName": "406800 TopUp",
    "price": 13.46
   },
   {
    "sizeName": "1080000 TopUp",
    "price": 30.8
   },
   {
    "sizeName": "2376000 TopUp",
    "price": 61.71
   },
   {
    "sizeName": "5427000 TopUp",
    "price": 128.52
   }
  ]
 },
 {
  "name": "Boom Beach",
  "nameAr": "بوم بيتش",
  "iconTerm": "Boom Beach",
  "category": "games",
  "mode": "PACKAGES",
  "speed": "INSTANT",
  "packages": [
   {
    "sizeName": "90 جوهرة",
    "price": 0.99
   },
   {
    "sizeName": "Extra Builder",
    "price": 3.5
   },
   {
    "sizeName": "500 جوهرة",
    "price": 4.99
   },
   {
    "sizeName": "1200 جوهرة",
    "price": 9.99
   },
   {
    "sizeName": "Instant Training",
    "price": 11
   },
   {
    "sizeName": "2500 جوهرة",
    "price": 19.99
   },
   {
    "sizeName": "6500 جوهرة",
    "price": 49.99
   },
   {
    "sizeName": "14000 جوهرة",
    "price": 99.99
   }
  ],
  "customFields": [
   {
    "id": "f-mega614",
    "labelAr": "البريد الالكتروني",
    "labelEn": "Email",
    "required": true
   }
  ]
 },
 {
  "name": "Free Fire Codes",
  "nameAr": "أكواد فري فاير",
  "iconTerm": "Free Fire",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "جوهرة Codes 100",
    "price": 0.96
   },
   {
    "sizeName": "جوهرة Codes 210",
    "price": 1.92
   },
   {
    "sizeName": "جوهرة Codes 530",
    "price": 4.81
   },
   {
    "sizeName": "جوهرة Codes 2200",
    "price": 19.23
   }
  ]
 },
 {
  "name": "iTunes Card",
  "nameAr": "بطاقات آيتونز",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "أمريكي",
    "nameEn": "USA"
   },
   {
    "nameAr": "إماراتي",
    "nameEn": "UAE"
   },
   {
    "nameAr": "تركي",
    "nameEn": "Turkey (TRY)"
   }
  ]
 },
 {
  "name": "PlayStation Card",
  "nameAr": "بطاقات بلايستيشن",
  "iconTerm": "PlayStation App",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "أمريكي",
    "nameEn": "USA"
   },
   {
    "nameAr": "إماراتي",
    "nameEn": "UAE"
   }
  ]
 },
 {
  "name": "Steam Card",
  "nameAr": "بطاقات ستيم",
  "iconTerm": "Steam Mobile",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Global 5 USD",
    "price": 5.8
   },
   {
    "sizeName": "Global 10 USD",
    "price": 12.63
   },
   {
    "sizeName": "Global 20 USD",
    "price": 21.74
   },
   {
    "sizeName": "Global 50 USD",
    "price": 55.9
   },
   {
    "sizeName": "Global 100 USD",
    "price": 108.18
   }
  ]
 },
 {
  "name": "Nintendo Card",
  "nameAr": "بطاقات نينتندو",
  "iconTerm": "Nintendo Switch Online",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "10$ eShop",
    "price": 9.23
   },
   {
    "sizeName": "20$ eShop",
    "price": 18.45
   },
   {
    "sizeName": "35$ eShop",
    "price": 32.29
   },
   {
    "sizeName": "50$ eShop",
    "price": 46.13
   }
  ]
 },
 {
  "name": "Roblox Card",
  "nameAr": "بطاقات روبلوكس",
  "iconTerm": "Roblox",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "بطاقة أمريكية",
    "nameEn": "USA card"
   },
   {
    "nameAr": "عملة روبوكس",
    "nameEn": "Robux"
   }
  ]
 },
 {
  "name": "PUBG Codes",
  "nameAr": "أكواد ببجي",
  "iconTerm": "PUBG MOBILE",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": []
 },
 {
  "name": "PUBG Mobile WOW Gift Cards",
  "nameAr": "بطاقات ببجي WOW",
  "iconTerm": "PUBG MOBILE",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "60 WOW Coins",
    "price": 0.9
   },
   {
    "sizeName": "Coins 325",
    "price": 4.7
   },
   {
    "sizeName": "Coins 660",
    "price": 9.41
   },
   {
    "sizeName": "Coins 1800",
    "price": 23.53
   },
   {
    "sizeName": "Coins 3850",
    "price": 47.07
   },
   {
    "sizeName": "Coins 8100",
    "price": 94.13
   }
  ]
 },
 {
  "name": "Valorant Card",
  "nameAr": "بطاقات فالورانت",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Riot Cash $5",
    "price": 4.84
   },
   {
    "sizeName": "Riot Cash $10",
    "price": 9.69
   },
   {
    "sizeName": "Riot Cash $20",
    "price": 19.38
   },
   {
    "sizeName": "Riot Cash $25",
    "price": 24.23
   },
   {
    "sizeName": "Riot Cash $35",
    "price": 33.91
   },
   {
    "sizeName": "Riot Cash $50",
    "price": 48.45
   },
   {
    "sizeName": "Riot Cash $100",
    "price": 96.9
   }
  ]
 },
 {
  "name": "League of Legends Card",
  "nameAr": "بطاقات ليغ أوف ليجندز",
  "iconTerm": "League of Legends: Wild Rift",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "5$",
    "price": 4.84
   },
   {
    "sizeName": "10$",
    "price": 9.69
   },
   {
    "sizeName": "20$",
    "price": 19.38
   },
   {
    "sizeName": "25$",
    "price": 24.23
   },
   {
    "sizeName": "35$",
    "price": 33.91
   },
   {
    "sizeName": "50$",
    "price": 48.45
   },
   {
    "sizeName": "100$",
    "price": 96.9
   }
  ]
 },
 {
  "name": "Xbox Game Pass",
  "nameAr": "إكس بوكس جيم باس",
  "iconTerm": "Xbox Game Pass",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Essential 1 Month (USA)",
    "price": 8.7
   },
   {
    "sizeName": "Premium 1 Month (USA)",
    "price": 13.65
   },
   {
    "sizeName": "Ultimate 1 Month (USA)",
    "price": 20
   },
   {
    "sizeName": "Essential 3 Months (USA)",
    "price": 21.75
   },
   {
    "sizeName": "Premium 3 Months (USA)",
    "price": 38
   },
   {
    "sizeName": "Ultimate 3 Months (USA)",
    "price": 60
   },
   {
    "sizeName": "Essential 12 Months (USA)",
    "price": 69.62
   }
  ]
 },
 {
  "name": "Google Play Card",
  "nameAr": "بطاقات جوجل بلاي",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "أمريكي",
    "nameEn": "US"
   }
  ]
 },
 {
  "name": "Razer Gold",
  "nameAr": "رازر جولد",
  "iconTerm": "Razer Gold",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "عالمي",
    "nameEn": "Global"
   }
  ]
 },
 {
  "name": "IMO Gift Cards",
  "nameAr": "بطاقات إيمو",
  "iconTerm": "imo",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "1 USD Giftcard",
    "price": 0.82
   },
   {
    "sizeName": "5 USD Giftcard",
    "price": 4.61
   }
  ]
 },
 {
  "name": "Minecraft Gift Card",
  "nameAr": "بطاقات ماينكرافت",
  "iconTerm": "Minecraft",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "1,720 Minecoins",
    "price": 8.71
   },
   {
    "sizeName": "3,500 Minecoins",
    "price": 14.35
   },
   {
    "sizeName": "Java & Bedrock Edition",
    "price": 18.66
   }
  ]
 },
 {
  "name": "Subscription Offers",
  "nameAr": "عروض الاشتراكات",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": []
 },
 {
  "name": "IPTV",
  "nameAr": "IPTV",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك ( شهر )",
    "price": 2
   },
   {
    "sizeName": "اشتراك ( 3 شهور )",
    "price": 4
   },
   {
    "sizeName": "اشتراك ( سنة )",
    "price": 10
   }
  ]
 },
 {
  "name": "GearUp Booster",
  "nameAr": "جير أب بوستر",
  "iconTerm": "GearUP Booster",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Mobile, 1 Month",
    "price": 8.5
   }
  ]
 },
 {
  "name": "Kling AI",
  "nameAr": "كلينغ",
  "iconTerm": "Kling AI",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": []
 },
 {
  "name": "Manus AI",
  "nameAr": "مانوس",
  "iconTerm": "Manus AI",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك Manus لمدة سنة",
    "price": 57
   },
   {
    "sizeName": "اشتراك Manus لمدة سنة",
    "price": 57
   }
  ]
 },
 {
  "name": "Apple ID",
  "nameAr": "حساب Apple ID",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "حسابات Apple",
    "nameEn": "Apple accounts"
   },
   {
    "nameAr": "حسابات Apple · جملة",
    "nameEn": "Apple accounts · wholesale"
   }
  ]
 },
 {
  "name": "App Store Plus",
  "nameAr": "متجر بلس للأيفون",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Plus ( سنة )",
    "price": 17
   }
  ]
 },
 {
  "name": "ExpressVPN",
  "nameAr": "إكسبريس VPN",
  "iconTerm": "ExpressVPN",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك شهر في Express VPN للكمبيوتر",
    "price": 1
   }
  ]
 },
 {
  "name": "NordVPN",
  "nameAr": "نورد VPN",
  "iconTerm": "NordVPN",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك 3 شهور nord vpn ( 10 اجهزة )",
    "price": 5
   },
   {
    "sizeName": "اشتراك 6 شهور nord vpn ( 10 اجهزة )",
    "price": 8
   },
   {
    "sizeName": "اشتراك nord vpn سنة ( 10 اجهزة )",
    "price": 14
   }
  ]
 },
 {
  "name": "Proton VPN",
  "nameAr": "بروتون VPN",
  "iconTerm": "Proton VPN",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "حساب شخصي لمدة شهر لـ 10 اجهزة",
    "price": 3
   },
   {
    "sizeName": "سنة",
    "price": 27
   }
  ]
 },
 {
  "name": "Netflix",
  "nameAr": "نتفليكس",
  "iconTerm": "Netflix",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "حساب نيتفليكس شهر جهاز واحد",
    "price": 4
   }
  ]
 },
 {
  "name": "Shahid",
  "nameAr": "شاهد",
  "iconTerm": "Shahid",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "حساب شاهد شخصي",
    "nameEn": "Personal account"
   }
  ]
 },
 {
  "name": "IPTV Shamna",
  "nameAr": "iP TV شامنا",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "3 اشهر",
    "price": 2.5
   },
   {
    "sizeName": "6 اشهر",
    "price": 5
   },
   {
    "sizeName": "سنة",
    "price": 8.5
   }
  ]
 },
 {
  "name": "IPTV LOOK 4K",
  "nameAr": "iP TV LOOK 4K",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "3 اشهر",
    "price": 5
   },
   {
    "sizeName": "6 اشهر",
    "price": 8
   },
   {
    "sizeName": "سنة",
    "price": 14
   }
  ]
 },
 {
  "name": "Anghami Plus",
  "nameAr": "أنغامي بلس",
  "iconTerm": "Anghami",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك Anghami Plus شهر",
    "price": 3.5
   },
   {
    "sizeName": "اشتراك Anghami Plus ستة اشهر",
    "price": 12
   },
   {
    "sizeName": "اشتراك Anghami Plus سنة",
    "price": 19
   }
  ]
 },
 {
  "name": "Canva Pro",
  "nameAr": "كانفا برو",
  "iconTerm": "Canva",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "سنة",
    "price": 0.5
   }
  ]
 },
 {
  "name": "CapCut",
  "nameAr": "كاب كات",
  "iconTerm": "CapCut",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "حساب CapCut Pro",
    "nameEn": "CapCut Pro account"
   },
   {
    "nameAr": "CapCut Pro · شخصي",
    "nameEn": "CapCut Pro · personal"
   },
   {
    "nameAr": "CapCut Pro · سنة",
    "nameEn": "CapCut Pro · 1 year"
   }
  ]
 },
 {
  "name": "Picsart",
  "nameAr": "بيكس آرت",
  "iconTerm": "Picsart",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "حساب شخصي لمدة سنة",
    "price": 15
   }
  ]
 },
 {
  "name": "Gemini Pro",
  "nameAr": "جيميني برو",
  "iconTerm": "Google Gemini",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "Gemini Plus · 6 أشهر",
    "nameEn": "Gemini Plus · 6 months"
   },
   {
    "nameAr": "Gemini Pro · سنة",
    "nameEn": "Gemini Pro · 1 year"
   }
  ]
 },
 {
  "name": "ChatGPT",
  "nameAr": "شات جي بي تي",
  "iconTerm": "ChatGPT",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [],
  "regions": [
   {
    "nameAr": "حساب جاهز · شهر",
    "nameEn": "Ready account · 1 month"
   },
   {
    "nameAr": "ChatGPT Go · 3 أشهر",
    "nameEn": "ChatGPT Go · 3 months"
   },
   {
    "nameAr": "ChatGPT Pro",
    "nameEn": "ChatGPT Pro"
   },
   {
    "nameAr": "ChatGPT Plus · شخصي",
    "nameEn": "ChatGPT Plus · personal"
   },
   {
    "nameAr": "حساب جاهز · 4 أشهر",
    "nameEn": "Ready account · 4 months"
   },
   {
    "nameAr": "ChatGPT Go · شهر",
    "nameEn": "ChatGPT Go · 1 month"
   }
  ]
 },
 {
  "name": "Perplexity Pro",
  "nameAr": "بيربلكسيتي برو",
  "iconTerm": "Perplexity",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك PERPLEXITY PRO سنة",
    "price": 24
   }
  ]
 },
 {
  "name": "Claude AI Pro",
  "nameAr": "كلود برو",
  "iconTerm": "Claude by Anthropic",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": []
 },
 {
  "name": "Gmail Account",
  "nameAr": "حساب جيميل",
  "iconTerm": "Gmail",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "حساب GMAIL جديد",
    "price": 1
   }
  ]
 },
 {
  "name": "Cursor",
  "nameAr": "كيرسر",
  "noIcon": true,
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "اشتراك ( شهر ) cursor pro",
    "price": 19
   },
   {
    "sizeName": "اشتراك ( شهر ) cursor pro plus",
    "price": 60
   }
  ]
 },
 {
  "name": "Amazon Prime",
  "nameAr": "أمازون برايم",
  "iconTerm": "Prime Video",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "6 Month",
    "price": 4
   }
  ]
 },
 {
  "name": "Runway Pro",
  "nameAr": "رنواي برو",
  "iconTerm": "Runway",
  "category": "subscriptions",
  "mode": "VAULT",
  "packages": [
   {
    "sizeName": "Pro 12 motnhs",
    "price": 34
   }
  ]
 },
 {
  "name": "Syrian Telecom",
  "nameAr": "السورية للاتصالات",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": [],
  "counter": {
   "per100Usd": 0.6918,
   "min": 5,
   "step": 1
  }
 },
 {
  "name": "Sawa Internet",
  "nameAr": "مزود انترنت سوا",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Sama Internet",
  "nameAr": "مزود انترنت سما",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Omnia Internet",
  "nameAr": "مزود انترنت أمنية",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Aya Internet",
  "nameAr": "مزود انترنت آية",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "ProNet Internet",
  "nameAr": "مزود انترنت برو نت",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Yara Internet",
  "nameAr": "مزود انترنت يارا",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "MTS Internet",
  "nameAr": "مزود انترنت MTS",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Zad Internet",
  "nameAr": "مزود انترنت زاد",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "View Internet",
  "nameAr": "مزود انترنت فيو",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "LineNet Internet",
  "nameAr": "مزود انترنت لاين نت",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Laser Internet",
  "nameAr": "مزود انترنت ليزر",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Hi-Fi Internet",
  "nameAr": "مزود انترنت هاي فاي",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Amwaj Internet",
  "nameAr": "مزود انترنت أمواج",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Hyper Internet",
  "nameAr": "مزود انترنت هايبر",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Nas Internet",
  "nameAr": "مزود انترنت ناس",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "E-Net Internet",
  "nameAr": "مزود انترنت اي نت",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "SCS Internet",
  "nameAr": "مزود انترنت الجمعية SCS",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Internet Cards",
  "nameAr": "مزود انترنت بطاقات",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "Takamol Internet",
  "nameAr": "مزود انترنت تكامل",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": []
 },
 {
  "name": "MTN ADSL Bills",
  "nameAr": "فواتير MTN ADSL",
  "category": "mobile",
  "mode": "PACKAGES",
  "speed": "MANUAL",
  "input": "LANDLINE_PHONE",
  "groupId": "grp_isp",
  "noIcon": true,
  "packages": [],
  "counter": {
   "per100Usd": 0.7192,
   "min": 10,
   "step": 1
  }
 }
];
