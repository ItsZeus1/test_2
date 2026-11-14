/** Site Terms & Conditions — exact owner-approved wording (10 clauses, EN + AR). */
export type Clause = { title: string; body: string };

export const TERMS: Record<"en" | "ar", Clause[]> = {
  en: [
    { title: "The service", body: "We sell top-ups (game currency and software credit) delivered to the account or Player ID you give us. We are not affiliated with game or software publishers unless we say so." },
    { title: "Your account", body: "You must give accurate information, keep your password private, and use one account per person. You are responsible for everything done through your account." },
    { title: "Wallet and deposits", body: "You add funds to your wallet by sending a payment (for example via Sham Cash, Syriatel Cash, or MTN Cash) and submitting the correct amount and transaction number. Funds are added only after we verify the payment. Wallet balance can only be used to buy on this site." },
    { title: "Orders and delivery", body: "Check your Player ID and details before ordering. We are not responsible for orders sent to wrong details you entered. Delivery usually takes minutes but can take longer. If we cannot deliver, the amount is returned to your wallet." },
    { title: "Refunds", body: "Completed top-ups are final and cannot be reversed. Refunds are given only for orders we could not deliver." },
    { title: "Prices", body: "Prices may change at any time. The price shown when you place the order applies. We may cancel orders affected by an obvious pricing error." },
    { title: "Prohibited use", body: "Fraud, fake or reused payment details, abuse of the site or its systems, and chargeback abuse are forbidden. We may suspend accounts and cancel orders if these rules are broken." },
    { title: "Third-party games", body: "Game publishers have their own rules. We are not responsible for bans, rule changes or problems caused by a publisher or platform." },
    { title: "Privacy", body: "We store your email, phone number, orders and payments to run the service. We also count visits anonymously to understand how the site is used. We do not sell your personal data." },
    { title: "Changes and contact", body: "We may update these terms. Continuing to use the site means you accept the updated terms. For questions, use the contact links at the bottom of the home page." },
  ],
  ar: [
    { title: "طبيعة الخدمة", body: "يقدّم الموقع خدمة بيع وشحن الأرصدة الرقمية (عملات الألعاب، بطاقات الهدايا، وأرصدة البرامج والتطبيقات) والتي يتم تسليمها مباشرةً إلى الحساب أو معرّف اللاعب (Player ID) الذي يزوّدنا به العميل. نحن جهة مستقلة ولسنا تابعين أو معتمدين رسمياً من قِبل الشركات الناشرة للألعاب أو البرمجيات ما لم يُذكر خلاف ذلك صراحةً." },
    { title: "حساب المستخدم", body: "يلتزم المستخدم بتقديم بيانات صحيحة ودقيقة عند التسجيل، والحفاظ على سرية كلمة المرور الخاصة به، ويُسمح بحساب واحد فقط لكل شخص. يتحمّل المستخدم المسؤولية القانونية والمالية الكاملة عن جميع العمليات والأنشطة التي تتم عبر حسابه." },
    { title: "المحفظة والإيداعات المالية", body: "يمكن للمستخدم تغذية رصيد محفظته عبر إرسال دفعة مالية من خلال وسائل الدفع المعتمدة لدينا (شام كاش، سيريتل كاش، أو إم تي إن كاش) وإدخال المبلغ الصحيح ورقم عملية التحويل وبيانات المرسل بدقة. لا تتم إضافة الرصيد إلى المحفظة إلا بعد التحقق الفعلي من وصول الحوالة ومطابقتها من قِبل الإدارة. يُستخدم رصيد المحفظة حصرياً للشراء داخل هذا الموقع ولا يمكن سحبه نقداً." },
    { title: "الطلبات والتسليم", body: "يتوجب على المستخدم التأكد من صحة معرّف اللاعب (Player ID) وكافة بيانات الحساب قبل تأكيد الطلب. يخلي الموقع مسؤوليته تماماً عن أي طلبات يتم إرسالها إلى حسابات أو أرقام خاطئة قام المستخدم بإدخالها. يتم تنفيذ الطلبات عادةً خلال دقائق معدودة، وقد يستغرق الأمر وقتاً أطول في حالات الضغط أو الصيانة. وفي حال تعذّر تسليم الطلب من طرفنا، تتم إعادة المبلغ كاملاً إلى محفظة المستخدم داخل الموقع." },
    { title: "سياسة الاسترجاع", body: "جميع عمليات الشحن المكتملة تُعد نهائية وقطعية ولا يمكن إلغاؤها أو استرداد قيمتها بعد التنفيذ. يقتصر استرداد الرصيد على الطلبات التي تعذّر علينا تنفيذها أو تسليمها فقط." },
    { title: "الأسعار", body: "تخضع الأسعار للتحديث أو التعديل في أي وقت دون إشعار مسبق، ويُعتدّ بالسعر المعروض لحظة إتمام وتأكيد الطلب. يحتفظ الموقع بحقه في إلغاء أي طلب ناتج عن خطأ تسعيري واضح أو خلل تقني مع إعادة الرصيد إلى محفظة المستخدم." },
    { title: "الاستخدام المحظور", body: "يُحظر قطعياً القيام بأي أعمال احتيالية، أو تقديم إشعارات أو أرقام تحويل مزورة أو مكررة، أو إساءة استخدام أنظمة الموقع وثغراته، أو التلاعب بعمليات الدفع. ويحق لإدارة الموقع تجميد أو حظر الحسابات المخالفة وإلغاء طلباتها فوراً ودون سابق إنذار." },
    { title: "الألعاب والمنصات التابعة لأطراف ثالثة", body: "تخضع الألعاب والتطبيقات لسياسات وقوانين الشركات الناشرة لها؛ وعليه فإن الموقع غير مسؤول عن أي حظر للحسابات، أو تعديل في القواعد، أو مشكلات تقنية تصدر عن الشركة الناشرة أو المنصة المشغّلة للعبة." },
    { title: "الخصوصية وحماية البيانات", body: "يقوم الموقع بحفظ البريد الإلكتروني، ورقم الهاتف، وسجل الطلبات والمدفوعات بالقدر اللازم لتشغيل الخدمة وتنفيذ الطلبات، كما نقوم بإحصاء الزيارات بشكل مجهول الهوية لتحسين جودة وأداء الموقع. نحن نلتزم بعدم بيع أو مشاركة بياناتك الشخصية مع أي أطراف خارجية لأغراض تجارية." },
    { title: "التعديلات والتواصل", body: "تحتفظ إدارة الموقع بحقها في تحديث أو تعديل هذه الشروط والأحكام في أي وقت، ويُعتبر استمرارك في استخدام الموقع بمثابة موافقة صريحة وملزمة على الشروط المحدّثة. لأي استفسارات، يرجى التواصل معنا عبر قنوات الدعم والروابط المتاحة في أسفل الصفحة الرئيسية." },
  ],
};

/** Cookie Policy (EN + AR). Describes what the site actually stores in the browser. */
export const COOKIE_POLICY: Record<"en" | "ar", Clause[]> = {
  en: [
    { title: "What we store", body: "ZovaCharge keeps a small amount of data in your browser (cookies and local storage) so the store works quickly and remembers you." },
    { title: "Essential: sign-in session", body: "A session token keeps you signed in and protects your wallet and orders. Without it you would have to sign in on every page. This cannot be turned off." },
    { title: "Essential: preferences", body: "Your theme (light or dark), language (Arabic or English) and preview currency (USD or SYP) are remembered so the site looks the way you chose." },
    { title: "Essential: security & anti-spam", body: "Short-lived markers help us block repeated charge attempts, duplicate transfer numbers and automated abuse of the store." },
    { title: "Optional: anonymous analytics", body: "Only if you choose “Accept All”, we may count visits anonymously to understand which pages are used and improve speed. This never includes your name, email, phone or payments." },
    { title: "Your choice", body: "“Essential Only” keeps just what the store needs to work. You can change your choice at any time by clearing this site's data in your browser; the banner will then ask again." },
  ],
  ar: [
    { title: "ما الذي نحفظه", body: "يحفظ زوفا شارج كمية صغيرة من البيانات في متصفحك (ملفات تعريف الارتباط والتخزين المحلي) ليعمل المتجر بسرعة ويتذكرك." },
    { title: "ضروري: جلسة تسجيل الدخول", body: "رمز الجلسة يبقيك مسجلاً للدخول ويحمي محفظتك وطلباتك. من دونه ستحتاج إلى تسجيل الدخول في كل صفحة، ولا يمكن تعطيله." },
    { title: "ضروري: التفضيلات", body: "نتذكر السمة (نهاري أو ليلي) واللغة (العربية أو الإنجليزية) وعملة العرض (الدولار أو الليرة السورية) ليظهر الموقع كما اخترت." },
    { title: "ضروري: الأمان ومنع الإساءة", body: "علامات قصيرة الأمد تساعدنا على منع محاولات الشحن المتكررة وأرقام التحويل المكررة والإساءة الآلية للمتجر." },
    { title: "اختياري: إحصاءات مجهولة الهوية", body: "فقط إذا اخترت «موافقة»، قد نحصي الزيارات بشكل مجهول لفهم الصفحات الأكثر استخداماً وتحسين السرعة، ولا يشمل ذلك اسمك أو بريدك أو هاتفك أو مدفوعاتك أبداً." },
    { title: "اختيارك", body: "«الضرورية فقط» تُبقي ما يحتاجه المتجر للعمل فقط. يمكنك تغيير اختيارك في أي وقت بمسح بيانات هذا الموقع من المتصفح، وسيظهر لك الشريط مجدداً." },
  ],
};

