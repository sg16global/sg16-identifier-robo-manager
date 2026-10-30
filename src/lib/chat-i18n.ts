import { identity } from "@/lib/identity";

/**
 * Chat widget dictionary. Every robot line exists in every language, so a
 * language switch re-renders the whole conversation. To add a language: add
 * it to CHAT_LANGUAGES, give it a dictionary (TypeScript enforces every key),
 * and optionally add keywords to INTENT_KEYWORDS.
 *
 * Product and assistant names are never spelled out here: strings use the
 * {app} and {assistant} placeholders, filled from the deployment identity.
 *
 * Translations were written for this widget and should be reviewed by native
 * speakers before launch.
 */

export const CHAT_LANGUAGES = [
  { code: "en", speech: "en-US", dir: "ltr" },
  { code: "es", speech: "es-ES", dir: "ltr" },
  { code: "fr", speech: "fr-FR", dir: "ltr" },
  { code: "de", speech: "de-DE", dir: "ltr" },
  { code: "zh-Hans", speech: "zh-CN", dir: "ltr" },
  { code: "ar", speech: "ar-SA", dir: "rtl" },
  { code: "hi", speech: "hi-IN", dir: "ltr" },
  { code: "ru", speech: "ru-RU", dir: "ltr" },
  { code: "bn", speech: "bn-IN", dir: "ltr" },
] as const;

export type ChatLang = (typeof CHAT_LANGUAGES)[number]["code"];
export const DEFAULT_LANG: ChatLang = "en";

export function isChatLang(value: unknown): value is ChatLang {
  return CHAT_LANGUAGES.some((l) => l.code === value);
}

export function languageInfo(code: ChatLang) {
  return CHAT_LANGUAGES.find((l) => l.code === code) ?? CHAT_LANGUAGES[0];
}

const EN = {
  "ui.subtitle": "Ask me about {app}",
  "ui.placeholder": "Type your question…",
  "ui.send": "Send",
  "ui.close": "Close chat",
  "ui.language": "Language",
  "ui.voiceOn": "Voice on",
  "ui.voiceOff": "Voice off",
  "ui.voiceUnavailable": "No voice for this language on this device — replies are text only.",
  "ui.mutedHint": "The robot is muted — unmute it to hear replies.",
  "ui.scanning": "Scanning…",
  "ui.you": "You",

  greeting: "Hello! I'm the {assistant}. How can I help you today?",

  "q.verifyWebsite": "How do I verify a website?",
  "q.whatIs": "What is {app}?",
  "q.howWorks": "How does the verification work?",
  "q.free": "Is this service free?",
  "q.languages": "What languages do you support?",
  "q.changeLanguage": "Change language",

  "a.verifyWebsite":
    "Paste the full web address into the check box on the homepage and press Identify. I look at the domain and its DNS and mail records, the SSL certificate, signs of brand impersonation and threat lookups, then show every finding with its source.",
  "a.whatIs":
    "{app} is a free verification engine for four problems: counterfeit products, unverified news, cloned shops and synthetic media. Each report separates what was checked, what was contradicted and what remains unknown.",
  "a.howWorks":
    "Great question! I analyse websites, products, news claims and media files. I gather evidence from several sources and give a confidence score when the evidence supports one. I never guess — I only report what the evidence shows. Want to try it now?",
  "a.free":
    "Yes. Checks are free for the public: no account, no subscription, no card. The service is operated independently of any check's outcome.",
  "a.languages": "I can chat in {languages}. Pick one from the language menu at the top of this panel.",
  "a.changeLanguage": "Choose a language from the menu at the top of this panel.",
  "a.fallback": "I don't have an answer for that yet. These are the topics I can help with:",
  "a.languageChanged": "Done — I'll reply in English from now on.",

  "action.tryNow": "Try it now",
  "action.yesExplain": "Yes, explain",
  "action.noThanks": "No thanks",

  "scan.website":
    "I'm scanning that website for you. This usually takes a few seconds. I'm checking the SSL certificate, DNS records and threat databases.",
  "scan.product":
    "I'm checking that product for you. I'm validating identifiers like the IMEI or barcode check digits and comparing them with manufacturer records.",
  "scan.claim": "I'm checking that claim for you. I'm breaking it into checkable statements and looking for published fact-checks.",
  "scan.media": "I'm examining that image for you. I'm reading its metadata, file structure and content credentials.",
  "scan.auto": "I'm scanning your input. First I work out which kind of check fits, then I gather the evidence.",
  "scan.done": "Scan complete. The result: {verdict}.",
  "scan.failed": "The scan could not finish.",
  "scan.askExplain": "Would you like me to explain what this result means?",

  "verdict.ok": "low risk",
  "verdict.warn": "suspicious",
  "verdict.risk": "high risk",
  "verdict.unknown": "inconclusive — not enough evidence",

  "explain.risk":
    "High risk means the evidence contradicted the input or matched known warning signs. Don't enter passwords or payment details there. Open the full report to see each finding and its source.",
  "explain.error":
    "The engine could not complete the check. Often the site did not respond, the input was too short, or the request limit was reached. Check the input and try again in a minute.",
  "explain.no": "Alright. I'm here if you need me.",
};

export type MessageKey = keyof typeof EN;
type Dictionary = Record<MessageKey, string>;

const ES: Dictionary = {
  "ui.subtitle": "Pregúntame sobre {app}",
  "ui.placeholder": "Escribe tu pregunta…",
  "ui.send": "Enviar",
  "ui.close": "Cerrar chat",
  "ui.language": "Idioma",
  "ui.voiceOn": "Voz activada",
  "ui.voiceOff": "Voz desactivada",
  "ui.voiceUnavailable": "No hay voz para este idioma en este dispositivo: las respuestas serán solo texto.",
  "ui.mutedHint": "El robot está silenciado: actívalo para oír las respuestas.",
  "ui.scanning": "Analizando…",
  "ui.you": "Tú",
  greeting: "¡Hola! Soy el {assistant}. ¿En qué puedo ayudarte hoy?",
  "q.verifyWebsite": "¿Cómo verifico un sitio web?",
  "q.whatIs": "¿Qué es {app}?",
  "q.howWorks": "¿Cómo funciona la verificación?",
  "q.free": "¿Este servicio es gratuito?",
  "q.languages": "¿Qué idiomas hablas?",
  "q.changeLanguage": "Cambiar idioma",
  "a.verifyWebsite":
    "Pega la dirección web completa en el cuadro de verificación de la página de inicio y pulsa Identify. Reviso el dominio y sus registros DNS y de correo, el certificado SSL, señales de suplantación de marca y consultas a bases de amenazas, y muestro cada hallazgo con su fuente.",
  "a.whatIs":
    "{app} es un motor de verificación gratuito para cuatro problemas: productos falsificados, noticias sin verificar, tiendas clonadas y contenido sintético. Cada informe separa lo que se comprobó, lo que se contradijo y lo que sigue sin saberse.",
  "a.howWorks":
    "¡Buena pregunta! Analizo sitios web, productos, afirmaciones de noticias y archivos multimedia. Reúno pruebas de varias fuentes y doy una puntuación de confianza cuando las pruebas lo permiten. Nunca adivino: solo informo de lo que muestran las pruebas. ¿Quieres probarlo ahora?",
  "a.free":
    "Sí. Las verificaciones son gratuitas para el público: sin cuenta, sin suscripción y sin tarjeta. El servicio opera con independencia del resultado de cualquier verificación.",
  "a.languages": "Puedo conversar en {languages}. Elige uno en el menú de idioma de la parte superior de este panel.",
  "a.changeLanguage": "Elige un idioma en el menú de la parte superior de este panel.",
  "a.fallback": "Todavía no tengo respuesta para eso. Estos son los temas en los que puedo ayudarte:",
  "a.languageChanged": "Listo: a partir de ahora responderé en español.",
  "action.tryNow": "Probar ahora",
  "action.yesExplain": "Sí, explícalo",
  "action.noThanks": "No, gracias",
  "scan.website":
    "Estoy analizando ese sitio web. Suele tardar unos segundos. Reviso el certificado SSL, los registros DNS y las bases de datos de amenazas.",
  "scan.product":
    "Estoy comprobando ese producto. Valido identificadores como el IMEI o los dígitos de control del código de barras y los comparo con los registros del fabricante.",
  "scan.claim": "Estoy comprobando esa afirmación. La divido en enunciados verificables y busco verificaciones de datos publicadas.",
  "scan.media": "Estoy examinando esa imagen. Leo sus metadatos, la estructura del archivo y las credenciales de contenido.",
  "scan.auto": "Estoy analizando lo que enviaste. Primero decido qué tipo de verificación corresponde y luego reúno las pruebas.",
  "scan.done": "Análisis completado. Resultado: {verdict}.",
  "scan.failed": "El análisis no pudo completarse.",
  "scan.askExplain": "¿Quieres que te explique qué significa este resultado?",
  "verdict.ok": "riesgo bajo",
  "verdict.warn": "sospechoso",
  "verdict.risk": "riesgo alto",
  "verdict.unknown": "no concluyente: no hay pruebas suficientes",
  "explain.risk":
    "Riesgo alto significa que las pruebas contradicen lo enviado o coinciden con señales de alerta conocidas. No introduzcas contraseñas ni datos de pago allí. Abre el informe completo para ver cada hallazgo y su fuente.",
  "explain.error":
    "El motor no pudo completar la verificación. A menudo el sitio no respondió, el texto era demasiado corto o se alcanzó el límite de solicitudes. Revisa lo que enviaste e inténtalo de nuevo en un minuto.",
  "explain.no": "De acuerdo. Aquí estoy si me necesitas.",
};

const FR: Dictionary = {
  "ui.subtitle": "Posez-moi vos questions sur {app}",
  "ui.placeholder": "Écrivez votre question…",
  "ui.send": "Envoyer",
  "ui.close": "Fermer le chat",
  "ui.language": "Langue",
  "ui.voiceOn": "Voix activée",
  "ui.voiceOff": "Voix désactivée",
  "ui.voiceUnavailable": "Aucune voix pour cette langue sur cet appareil : réponses en texte uniquement.",
  "ui.mutedHint": "Le robot est en sourdine : réactivez le son pour entendre les réponses.",
  "ui.scanning": "Analyse en cours…",
  "ui.you": "Vous",
  greeting: "Bonjour ! Je suis le {assistant}. Comment puis-je vous aider aujourd'hui ?",
  "q.verifyWebsite": "Comment vérifier un site web ?",
  "q.whatIs": "Qu'est-ce que {app} ?",
  "q.howWorks": "Comment fonctionne la vérification ?",
  "q.free": "Ce service est-il gratuit ?",
  "q.languages": "Quelles langues parlez-vous ?",
  "q.changeLanguage": "Changer de langue",
  "a.verifyWebsite":
    "Collez l'adresse web complète dans la zone de vérification de la page d'accueil et appuyez sur Identify. J'examine le domaine et ses enregistrements DNS et de messagerie, le certificat SSL, les signes d'usurpation de marque et les bases de menaces, puis j'affiche chaque constat avec sa source.",
  "a.whatIs":
    "{app} est un moteur de vérification gratuit pour quatre problèmes : produits contrefaits, informations non vérifiées, boutiques clonées et médias synthétiques. Chaque rapport distingue ce qui a été vérifié, ce qui a été contredit et ce qui reste inconnu.",
  "a.howWorks":
    "Bonne question ! J'analyse des sites web, des produits, des affirmations d'actualité et des fichiers multimédias. Je rassemble des preuves de plusieurs sources et j'indique un score de confiance lorsque les preuves le permettent. Je ne devine jamais : je rapporte seulement ce que montrent les preuves. Voulez-vous essayer maintenant ?",
  "a.free":
    "Oui. Les vérifications sont gratuites pour le public : sans compte, sans abonnement, sans carte. Le service fonctionne en toute indépendance du résultat d'une vérification.",
  "a.languages": "Je peux discuter en {languages}. Choisissez-en une dans le menu des langues en haut de ce panneau.",
  "a.changeLanguage": "Choisissez une langue dans le menu en haut de ce panneau.",
  "a.fallback": "Je n'ai pas encore de réponse à cela. Voici les sujets sur lesquels je peux vous aider :",
  "a.languageChanged": "C'est fait : je répondrai désormais en français.",
  "action.tryNow": "Essayer maintenant",
  "action.yesExplain": "Oui, expliquez",
  "action.noThanks": "Non merci",
  "scan.website":
    "J'analyse ce site web pour vous. Cela prend généralement quelques secondes. Je vérifie le certificat SSL, les enregistrements DNS et les bases de menaces.",
  "scan.product":
    "Je vérifie ce produit pour vous. Je valide des identifiants comme l'IMEI ou les chiffres de contrôle du code-barres et je les compare aux données du fabricant.",
  "scan.claim": "Je vérifie cette affirmation pour vous. Je la découpe en énoncés vérifiables et je cherche des vérifications publiées.",
  "scan.media": "J'examine cette image pour vous. Je lis ses métadonnées, la structure du fichier et les identifiants de contenu.",
  "scan.auto": "J'analyse votre saisie. Je détermine d'abord le type de vérification adapté, puis je rassemble les preuves.",
  "scan.done": "Analyse terminée. Résultat : {verdict}.",
  "scan.failed": "L'analyse n'a pas pu aboutir.",
  "scan.askExplain": "Voulez-vous que je vous explique ce que signifie ce résultat ?",
  "verdict.ok": "risque faible",
  "verdict.warn": "suspect",
  "verdict.risk": "risque élevé",
  "verdict.unknown": "non concluant : preuves insuffisantes",
  "explain.risk":
    "Risque élevé signifie que les preuves contredisent votre saisie ou correspondent à des signaux d'alerte connus. N'y saisissez ni mot de passe ni données de paiement. Ouvrez le rapport complet pour voir chaque constat et sa source.",
  "explain.error":
    "Le moteur n'a pas pu terminer la vérification. Souvent, le site n'a pas répondu, la saisie était trop courte ou la limite de requêtes a été atteinte. Vérifiez votre saisie et réessayez dans une minute.",
  "explain.no": "Très bien. Je suis là si vous avez besoin de moi.",
};

const DE: Dictionary = {
  "ui.subtitle": "Frag mich alles zu {app}",
  "ui.placeholder": "Gib deine Frage ein…",
  "ui.send": "Senden",
  "ui.close": "Chat schließen",
  "ui.language": "Sprache",
  "ui.voiceOn": "Stimme an",
  "ui.voiceOff": "Stimme aus",
  "ui.voiceUnavailable": "Für diese Sprache gibt es auf diesem Gerät keine Stimme – Antworten nur als Text.",
  "ui.mutedHint": "Der Roboter ist stummgeschaltet – schalte den Ton ein, um Antworten zu hören.",
  "ui.scanning": "Prüfung läuft…",
  "ui.you": "Du",
  greeting: "Hallo! Ich bin der {assistant}. Wie kann ich dir heute helfen?",
  "q.verifyWebsite": "Wie prüfe ich eine Website?",
  "q.whatIs": "Was ist {app}?",
  "q.howWorks": "Wie funktioniert die Prüfung?",
  "q.free": "Ist dieser Dienst kostenlos?",
  "q.languages": "Welche Sprachen sprichst du?",
  "q.changeLanguage": "Sprache ändern",
  "a.verifyWebsite":
    "Füge die vollständige Webadresse in das Prüffeld auf der Startseite ein und drücke Identify. Ich prüfe die Domain mit ihren DNS- und Mail-Einträgen, das SSL-Zertifikat, Anzeichen für Markenmissbrauch und Bedrohungsdatenbanken und zeige jeden Befund mit Quelle.",
  "a.whatIs":
    "{app} ist eine kostenlose Prüfmaschine für vier Probleme: gefälschte Produkte, unbestätigte Nachrichten, geklonte Shops und synthetische Medien. Jeder Bericht trennt, was geprüft wurde, was widerlegt wurde und was unbekannt bleibt.",
  "a.howWorks":
    "Gute Frage! Ich analysiere Websites, Produkte, Nachrichtenbehauptungen und Mediendateien. Ich sammle Belege aus mehreren Quellen und gebe einen Konfidenzwert an, wenn die Belege einen tragen. Ich rate nie – ich berichte nur, was die Belege zeigen. Möchtest du es gleich ausprobieren?",
  "a.free":
    "Ja. Prüfungen sind für die Öffentlichkeit kostenlos: kein Konto, kein Abo, keine Karte. Der Dienst arbeitet unabhängig vom Ergebnis einer Prüfung.",
  "a.languages": "Ich kann auf {languages} chatten. Wähle oben in diesem Fenster eine Sprache aus dem Menü.",
  "a.changeLanguage": "Wähle oben in diesem Fenster eine Sprache aus dem Menü.",
  "a.fallback": "Darauf habe ich noch keine Antwort. Bei diesen Themen kann ich helfen:",
  "a.languageChanged": "Erledigt – ich antworte ab jetzt auf Deutsch.",
  "action.tryNow": "Jetzt ausprobieren",
  "action.yesExplain": "Ja, erklären",
  "action.noThanks": "Nein, danke",
  "scan.website":
    "Ich prüfe diese Website für dich. Das dauert meist ein paar Sekunden. Ich prüfe das SSL-Zertifikat, die DNS-Einträge und Bedrohungsdatenbanken.",
  "scan.product":
    "Ich prüfe dieses Produkt für dich. Ich validiere Kennungen wie die IMEI oder Barcode-Prüfziffern und vergleiche sie mit Herstellerdaten.",
  "scan.claim": "Ich prüfe diese Behauptung für dich. Ich zerlege sie in überprüfbare Aussagen und suche nach veröffentlichten Faktenchecks.",
  "scan.media": "Ich untersuche dieses Bild für dich. Ich lese seine Metadaten, die Dateistruktur und Content Credentials.",
  "scan.auto": "Ich prüfe deine Eingabe. Zuerst bestimme ich die passende Prüfart, dann sammle ich die Belege.",
  "scan.done": "Prüfung abgeschlossen. Ergebnis: {verdict}.",
  "scan.failed": "Die Prüfung konnte nicht abgeschlossen werden.",
  "scan.askExplain": "Soll ich dir erklären, was dieses Ergebnis bedeutet?",
  "verdict.ok": "geringes Risiko",
  "verdict.warn": "verdächtig",
  "verdict.risk": "hohes Risiko",
  "verdict.unknown": "nicht eindeutig – zu wenige Belege",
  "explain.risk":
    "Hohes Risiko heißt: Die Belege widersprechen deiner Eingabe oder passen zu bekannten Warnsignalen. Gib dort keine Passwörter oder Zahlungsdaten ein. Öffne den vollständigen Bericht, um jeden Befund mit Quelle zu sehen.",
  "explain.error":
    "Die Prüfung konnte nicht abgeschlossen werden. Oft hat die Website nicht geantwortet, die Eingabe war zu kurz oder das Anfragelimit war erreicht. Prüfe deine Eingabe und versuche es in einer Minute erneut.",
  "explain.no": "In Ordnung. Ich bin da, wenn du mich brauchst.",
};

const ZH: Dictionary = {
  "ui.subtitle": "关于 {app}，尽管问我",
  "ui.placeholder": "输入你的问题…",
  "ui.send": "发送",
  "ui.close": "关闭聊天",
  "ui.language": "语言",
  "ui.voiceOn": "语音开",
  "ui.voiceOff": "语音关",
  "ui.voiceUnavailable": "此设备没有该语言的语音，回复仅以文字显示。",
  "ui.mutedHint": "机器人已静音，取消静音即可听到回复。",
  "ui.scanning": "正在扫描…",
  "ui.you": "你",
  greeting: "你好！我是 {assistant}。今天我能帮你什么？",
  "q.verifyWebsite": "如何验证一个网站？",
  "q.whatIs": "{app} 是什么？",
  "q.howWorks": "验证是如何进行的？",
  "q.free": "这项服务免费吗？",
  "q.languages": "你支持哪些语言？",
  "q.changeLanguage": "切换语言",
  "a.verifyWebsite":
    "把完整网址粘贴到首页的检查框中，然后点击 Identify。我会检查域名及其 DNS 和邮件记录、SSL 证书、品牌冒充迹象以及威胁数据库，并列出每项发现及其来源。",
  "a.whatIs":
    "{app} 是一个免费的验证引擎，针对四类问题：假冒商品、未经证实的新闻、克隆网店和合成媒体。每份报告都会区分已核实的内容、被反驳的内容以及仍未知的内容。",
  "a.howWorks":
    "好问题！我分析网站、商品、新闻说法和媒体文件。我从多个来源收集证据，并在证据充分时给出置信度。我从不猜测，只报告证据所显示的内容。要现在试试吗？",
  "a.free":
    "是的。检查对公众免费：无需账户、无需订阅、无需银行卡。本服务的运作绝不取决于检查结果。",
  "a.languages": "我可以用{languages}聊天。请在本面板顶部的语言菜单中选择。",
  "a.changeLanguage": "请在本面板顶部的菜单中选择一种语言。",
  "a.fallback": "这个问题我暂时还无法回答。我可以在以下话题上帮助你：",
  "a.languageChanged": "好的，从现在起我将用中文回复。",
  "action.tryNow": "立即试用",
  "action.yesExplain": "好的，请解释",
  "action.noThanks": "不用了，谢谢",
  "scan.website": "我正在为你扫描这个网站，通常需要几秒钟。我在检查 SSL 证书、DNS 记录和威胁数据库。",
  "scan.product": "我正在为你检查这件商品。我会验证 IMEI 或条形码校验位等标识，并与制造商记录进行比对。",
  "scan.claim": "我正在为你核查这条说法。我会把它拆分成可核查的陈述，并查找已发布的事实核查。",
  "scan.media": "我正在为你检查这张图片。我会读取它的元数据、文件结构和内容凭证。",
  "scan.auto": "我正在分析你的输入。首先判断适合哪种检查，然后收集证据。",
  "scan.done": "扫描完成。结果：{verdict}。",
  "scan.failed": "扫描未能完成。",
  "scan.askExplain": "需要我解释这个结果的含义吗？",
  "verdict.ok": "低风险",
  "verdict.warn": "可疑",
  "verdict.risk": "高风险",
  "verdict.unknown": "无法定论（证据不足）",
  "explain.risk":
    "高风险表示证据与你的输入相矛盾，或与已知的警示信号相符。请不要在那里输入密码或付款信息。打开完整报告可查看每项发现及其来源。",
  "explain.error": "引擎未能完成检查。常见原因是网站没有响应、输入内容太短或已达到请求上限。请检查输入后一分钟再试。",
  "explain.no": "好的。需要时我随时都在。",
};

const AR: Dictionary = {
  "ui.subtitle": "اسألني عن {app}",
  "ui.placeholder": "اكتب سؤالك…",
  "ui.send": "إرسال",
  "ui.close": "إغلاق المحادثة",
  "ui.language": "اللغة",
  "ui.voiceOn": "الصوت مُفعّل",
  "ui.voiceOff": "الصوت متوقف",
  "ui.voiceUnavailable": "لا يتوفر صوت لهذه اللغة على هذا الجهاز، لذا ستظهر الردود نصًا فقط.",
  "ui.mutedHint": "الروبوت في وضع كتم الصوت، ألغِ الكتم لسماع الردود.",
  "ui.scanning": "جارٍ الفحص…",
  "ui.you": "أنت",
  greeting: "مرحبًا! أنا {assistant}. كيف يمكنني مساعدتك اليوم؟",
  "q.verifyWebsite": "كيف أتحقق من موقع إلكتروني؟",
  "q.whatIs": "ما هو {app}؟",
  "q.howWorks": "كيف يعمل التحقق؟",
  "q.free": "هل هذه الخدمة مجانية؟",
  "q.languages": "ما اللغات التي تدعمها؟",
  "q.changeLanguage": "تغيير اللغة",
  "a.verifyWebsite":
    "الصق عنوان الموقع كاملًا في مربع الفحص في الصفحة الرئيسية واضغط Identify. أفحص النطاق وسجلات DNS والبريد الخاصة به، وشهادة SSL، وعلامات انتحال العلامات التجارية، وقواعد بيانات التهديدات، ثم أعرض كل نتيجة مع مصدرها.",
  "a.whatIs":
    "{app} محرك تحقق مجاني لأربع مشكلات: المنتجات المقلدة، والأخبار غير المؤكدة، والمتاجر المستنسخة، والوسائط المصطنعة. يفصل كل تقرير بين ما تم التحقق منه وما ثبت عكسه وما يظل مجهولًا.",
  "a.howWorks":
    "سؤال رائع! أحلل المواقع والمنتجات والادعاءات الإخبارية وملفات الوسائط. أجمع الأدلة من مصادر متعددة وأقدم درجة ثقة عندما تدعمها الأدلة. لا أخمّن أبدًا، بل أنقل فقط ما تُظهره الأدلة. هل تريد التجربة الآن؟",
  "a.free":
    "نعم. الفحوصات مجانية للجمهور: بلا حساب ولا اشتراك ولا بطاقة. تعمل الخدمة باستقلال تام عن نتيجة أي فحص.",
  "a.languages": "يمكنني الدردشة باللغات التالية: {languages}. اختر لغة من قائمة اللغات في أعلى هذه اللوحة.",
  "a.changeLanguage": "اختر لغة من القائمة في أعلى هذه اللوحة.",
  "a.fallback": "ليست لدي إجابة عن ذلك بعد. هذه هي المواضيع التي يمكنني المساعدة فيها:",
  "a.languageChanged": "تم. سأرد باللغة العربية من الآن فصاعدًا.",
  "action.tryNow": "جرّبه الآن",
  "action.yesExplain": "نعم، اشرح",
  "action.noThanks": "لا، شكرًا",
  "scan.website": "أفحص هذا الموقع من أجلك. يستغرق ذلك عادةً بضع ثوانٍ. أتحقق من شهادة SSL وسجلات DNS وقواعد بيانات التهديدات.",
  "scan.product": "أفحص هذا المنتج من أجلك. أتحقق من المعرّفات مثل IMEI أو أرقام التحقق في الباركود وأقارنها بسجلات الشركة المصنعة.",
  "scan.claim": "أتحقق من هذا الادعاء من أجلك. أقسّمه إلى عبارات قابلة للتحقق وأبحث عن تدقيقات حقائق منشورة.",
  "scan.media": "أفحص هذه الصورة من أجلك. أقرأ بياناتها الوصفية وبنية الملف وبيانات اعتماد المحتوى.",
  "scan.auto": "أحلل ما أدخلته. أحدد أولًا نوع الفحص المناسب، ثم أجمع الأدلة.",
  "scan.done": "اكتمل الفحص. النتيجة: {verdict}.",
  "scan.failed": "تعذّر إكمال الفحص.",
  "scan.askExplain": "هل تريد أن أشرح لك معنى هذه النتيجة؟",
  "verdict.ok": "مخاطرة منخفضة",
  "verdict.warn": "مشبوه",
  "verdict.risk": "مخاطرة عالية",
  "verdict.unknown": "غير حاسم: الأدلة غير كافية",
  "explain.risk":
    "المخاطرة العالية تعني أن الأدلة تناقض ما أدخلته أو تطابق علامات تحذير معروفة. لا تُدخل هناك كلمات مرور أو بيانات دفع. افتح التقرير الكامل لترى كل نتيجة ومصدرها.",
  "explain.error":
    "لم يتمكن المحرك من إكمال الفحص. غالبًا لم يستجب الموقع، أو كان الإدخال قصيرًا جدًا، أو تم بلوغ حد الطلبات. راجع ما أدخلته وحاول مرة أخرى بعد دقيقة.",
  "explain.no": "حسنًا. أنا هنا إذا احتجت إليّ.",
};

const HI: Dictionary = {
  "ui.subtitle": "{app} के बारे में मुझसे पूछें",
  "ui.placeholder": "अपना सवाल लिखें…",
  "ui.send": "भेजें",
  "ui.close": "चैट बंद करें",
  "ui.language": "भाषा",
  "ui.voiceOn": "आवाज़ चालू",
  "ui.voiceOff": "आवाज़ बंद",
  "ui.voiceUnavailable": "इस डिवाइस पर इस भाषा की आवाज़ उपलब्ध नहीं है, इसलिए जवाब केवल टेक्स्ट में होंगे।",
  "ui.mutedHint": "रोबोट म्यूट है। जवाब सुनने के लिए अनम्यूट करें।",
  "ui.scanning": "स्कैन हो रहा है…",
  "ui.you": "आप",
  greeting: "नमस्ते! मैं {assistant} हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?",
  "q.verifyWebsite": "मैं किसी वेबसाइट को कैसे जाँचूँ?",
  "q.whatIs": "{app} क्या है?",
  "q.howWorks": "जाँच कैसे काम करती है?",
  "q.free": "क्या यह सेवा मुफ़्त है?",
  "q.languages": "आप कौन-सी भाषाएँ समझते हैं?",
  "q.changeLanguage": "भाषा बदलें",
  "a.verifyWebsite":
    "होमपेज पर जाँच बॉक्स में पूरा वेब पता चिपकाएँ और Identify दबाएँ। मैं डोमेन और उसके DNS व मेल रिकॉर्ड, SSL प्रमाणपत्र, ब्रांड की नकल के संकेत और ख़तरा डेटाबेस जाँचता हूँ, फिर हर निष्कर्ष उसके स्रोत के साथ दिखाता हूँ।",
  "a.whatIs":
    "{app} चार समस्याओं के लिए एक मुफ़्त जाँच इंजन है: नकली उत्पाद, असत्यापित ख़बरें, नकली ऑनलाइन दुकानें और कृत्रिम मीडिया। हर रिपोर्ट अलग-अलग बताती है कि क्या जाँचा गया, क्या ग़लत साबित हुआ और क्या अब भी अज्ञात है।",
  "a.howWorks":
    "बढ़िया सवाल! मैं वेबसाइटों, उत्पादों, ख़बरों के दावों और मीडिया फ़ाइलों का विश्लेषण करता हूँ। मैं कई स्रोतों से सबूत जुटाता हूँ और जब सबूत पर्याप्त हों तो भरोसे का स्कोर देता हूँ। मैं कभी अनुमान नहीं लगाता — केवल वही बताता हूँ जो सबूत दिखाते हैं। क्या आप अभी आज़माना चाहेंगे?",
  "a.free":
    "हाँ। जाँच आम लोगों के लिए मुफ़्त है: न खाता, न सदस्यता, न कार्ड। यह सेवा किसी भी जाँच के नतीजे से पूरी तरह स्वतंत्र होकर काम करती है।",
  "a.languages": "मैं इन भाषाओं में बात कर सकता हूँ: {languages}। इस पैनल के ऊपर दिए भाषा मेन्यू से कोई एक चुनें।",
  "a.changeLanguage": "इस पैनल के ऊपर दिए मेन्यू से कोई भाषा चुनें।",
  "a.fallback": "इसका जवाब अभी मेरे पास नहीं है। मैं इन विषयों में मदद कर सकता हूँ:",
  "a.languageChanged": "हो गया — अब से मैं हिंदी में जवाब दूँगा।",
  "action.tryNow": "अभी आज़माएँ",
  "action.yesExplain": "हाँ, समझाइए",
  "action.noThanks": "नहीं, धन्यवाद",
  "scan.website":
    "मैं आपके लिए यह वेबसाइट स्कैन कर रहा हूँ। इसमें आमतौर पर कुछ सेकंड लगते हैं। मैं SSL प्रमाणपत्र, DNS रिकॉर्ड और ख़तरा डेटाबेस जाँच रहा हूँ।",
  "scan.product":
    "मैं आपके लिए यह उत्पाद जाँच रहा हूँ। मैं IMEI या बारकोड चेक डिजिट जैसे पहचानकर्ताओं को सत्यापित करके निर्माता के रिकॉर्ड से मिलाता हूँ।",
  "scan.claim": "मैं आपके लिए यह दावा जाँच रहा हूँ। मैं इसे जाँचे जा सकने वाले कथनों में बाँटकर प्रकाशित फ़ैक्ट-चेक खोजता हूँ।",
  "scan.media": "मैं आपके लिए यह तस्वीर जाँच रहा हूँ। मैं इसका मेटाडेटा, फ़ाइल संरचना और कंटेंट क्रेडेंशियल पढ़ रहा हूँ।",
  "scan.auto": "मैं आपका इनपुट जाँच रहा हूँ। पहले तय करता हूँ कि कौन-सी जाँच सही है, फिर सबूत जुटाता हूँ।",
  "scan.done": "स्कैन पूरा हुआ। नतीजा: {verdict}।",
  "scan.failed": "स्कैन पूरा नहीं हो सका।",
  "scan.askExplain": "क्या आप चाहेंगे कि मैं इस नतीजे का मतलब समझाऊँ?",
  "verdict.ok": "कम जोखिम",
  "verdict.warn": "संदिग्ध",
  "verdict.risk": "उच्च जोखिम",
  "verdict.unknown": "अनिर्णायक — पर्याप्त सबूत नहीं",
  "explain.risk":
    "उच्च जोखिम का मतलब है कि सबूत आपके इनपुट के उलट हैं या जाने-पहचाने चेतावनी संकेतों से मेल खाते हैं। वहाँ पासवर्ड या भुगतान की जानकारी न डालें। हर निष्कर्ष और उसका स्रोत देखने के लिए पूरी रिपोर्ट खोलें।",
  "explain.error":
    "इंजन जाँच पूरी नहीं कर सका। अक्सर साइट ने जवाब नहीं दिया, इनपुट बहुत छोटा था, या अनुरोध सीमा पूरी हो गई। अपना इनपुट जाँचें और एक मिनट बाद फिर कोशिश करें।",
  "explain.no": "ठीक है। ज़रूरत हो तो मैं यहीं हूँ।",
};

const RU: Dictionary = {
  "ui.subtitle": "Спросите меня о {app}",
  "ui.placeholder": "Введите вопрос…",
  "ui.send": "Отправить",
  "ui.close": "Закрыть чат",
  "ui.language": "Язык",
  "ui.voiceOn": "Голос вкл.",
  "ui.voiceOff": "Голос выкл.",
  "ui.voiceUnavailable": "На этом устройстве нет голоса для этого языка — ответы будут только текстом.",
  "ui.mutedHint": "Звук робота выключен — включите его, чтобы слышать ответы.",
  "ui.scanning": "Идёт проверка…",
  "ui.you": "Вы",
  greeting: "Здравствуйте! Я {assistant}. Чем могу помочь сегодня?",
  "q.verifyWebsite": "Как проверить сайт?",
  "q.whatIs": "Что такое {app}?",
  "q.howWorks": "Как работает проверка?",
  "q.free": "Это бесплатно?",
  "q.languages": "Какие языки вы поддерживаете?",
  "q.changeLanguage": "Сменить язык",
  "a.verifyWebsite":
    "Вставьте полный адрес сайта в поле проверки на главной странице и нажмите Identify. Я проверю домен, его DNS- и почтовые записи, SSL-сертификат, признаки подделки бренда и базы угроз, а затем покажу каждый вывод с источником.",
  "a.whatIs":
    "{app} — бесплатный сервис проверки для четырёх задач: поддельные товары, непроверенные новости, клоны интернет-магазинов и синтетические медиа. Каждый отчёт отделяет то, что проверено, то, что опровергнуто, и то, что остаётся неизвестным.",
  "a.howWorks":
    "Хороший вопрос! Я анализирую сайты, товары, новостные утверждения и медиафайлы. Я собираю данные из нескольких источников и указываю степень уверенности, когда доказательства это позволяют. Я никогда не гадаю — сообщаю только то, что показывают доказательства. Хотите попробовать прямо сейчас?",
  "a.free":
    "Да. Проверки бесплатны для всех: без аккаунта, подписки и карты. Сервис работает полностью независимо от результата проверки.",
  "a.languages": "Я могу общаться на этих языках: {languages}. Выберите язык в меню вверху этой панели.",
  "a.changeLanguage": "Выберите язык в меню вверху этой панели.",
  "a.fallback": "Пока у меня нет ответа на этот вопрос. Вот темы, с которыми я могу помочь:",
  "a.languageChanged": "Готово — теперь я буду отвечать по-русски.",
  "action.tryNow": "Попробовать",
  "action.yesExplain": "Да, объясните",
  "action.noThanks": "Нет, спасибо",
  "scan.website": "Я проверяю этот сайт. Обычно это занимает несколько секунд. Я проверяю SSL-сертификат, DNS-записи и базы угроз.",
  "scan.product": "Я проверяю этот товар. Я сверяю идентификаторы — IMEI или контрольные цифры штрихкода — с данными производителя.",
  "scan.claim": "Я проверяю это утверждение. Я разбиваю его на проверяемые высказывания и ищу опубликованные фактчеки.",
  "scan.media": "Я изучаю это изображение. Я читаю его метаданные, структуру файла и учётные данные контента.",
  "scan.auto": "Я анализирую ваш запрос. Сначала определяю подходящий тип проверки, затем собираю доказательства.",
  "scan.done": "Проверка завершена. Результат: {verdict}.",
  "scan.failed": "Проверку не удалось завершить.",
  "scan.askExplain": "Объяснить, что означает этот результат?",
  "verdict.ok": "низкий риск",
  "verdict.warn": "подозрительно",
  "verdict.risk": "высокий риск",
  "verdict.unknown": "неопределённо — недостаточно данных",
  "explain.risk":
    "Высокий риск означает, что доказательства противоречат вашему запросу или совпадают с известными тревожными признаками. Не вводите там пароли и платёжные данные. Откройте полный отчёт, чтобы увидеть каждый вывод и его источник.",
  "explain.error":
    "Сервису не удалось завершить проверку. Часто сайт не ответил, запрос был слишком коротким или был достигнут лимит запросов. Проверьте ввод и повторите попытку через минуту.",
  "explain.no": "Хорошо. Я рядом, если понадоблюсь.",
};

const BN: Dictionary = {
  "ui.subtitle": "{app} সম্পর্কে আমাকে জিজ্ঞাসা করুন",
  "ui.placeholder": "আপনার প্রশ্ন লিখুন…",
  "ui.send": "পাঠান",
  "ui.close": "চ্যাট বন্ধ করুন",
  "ui.language": "ভাষা",
  "ui.voiceOn": "ভয়েস চালু",
  "ui.voiceOff": "ভয়েস বন্ধ",
  "ui.voiceUnavailable": "এই ডিভাইসে এই ভাষার কোনো ভয়েস নেই, তাই উত্তর শুধু লেখায় দেখানো হবে।",
  "ui.mutedHint": "রোবট মিউট করা আছে। উত্তর শুনতে আনমিউট করুন।",
  "ui.scanning": "স্ক্যান চলছে…",
  "ui.you": "আপনি",
  greeting: "হ্যালো! আমি {assistant}। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "q.verifyWebsite": "আমি কীভাবে একটি ওয়েবসাইট যাচাই করব?",
  "q.whatIs": "{app} কী?",
  "q.howWorks": "যাচাই কীভাবে কাজ করে?",
  "q.free": "এই সেবা কি বিনামূল্যে?",
  "q.languages": "আপনি কোন কোন ভাষা সমর্থন করেন?",
  "q.changeLanguage": "ভাষা পরিবর্তন করুন",
  "a.verifyWebsite":
    "হোমপেজের যাচাই বক্সে পুরো ওয়েব ঠিকানাটি পেস্ট করে Identify চাপুন। আমি ডোমেইন ও তার DNS ও মেইল রেকর্ড, SSL সার্টিফিকেট, ব্র্যান্ড নকলের লক্ষণ এবং হুমকি ডেটাবেস পরীক্ষা করি, তারপর প্রতিটি ফলাফল তার উৎসসহ দেখাই।",
  "a.whatIs":
    "{app} চারটি সমস্যার জন্য একটি বিনামূল্যের যাচাই ইঞ্জিন: নকল পণ্য, অযাচাইকৃত খবর, নকল অনলাইন দোকান এবং কৃত্রিম মিডিয়া। প্রতিটি রিপোর্টে আলাদা করে দেখানো হয় কী যাচাই হয়েছে, কী ভুল প্রমাণিত হয়েছে এবং কী এখনও অজানা।",
  "a.howWorks":
    "চমৎকার প্রশ্ন! আমি ওয়েবসাইট, পণ্য, খবরের দাবি এবং মিডিয়া ফাইল বিশ্লেষণ করি। আমি একাধিক উৎস থেকে প্রমাণ সংগ্রহ করি এবং প্রমাণ যথেষ্ট হলে একটি আস্থা স্কোর দিই। আমি কখনো অনুমান করি না — প্রমাণ যা দেখায় শুধু তা-ই জানাই। এখনই চেষ্টা করে দেখবেন?",
  "a.free":
    "হ্যাঁ। সাধারণ মানুষের জন্য যাচাই বিনামূল্যে: কোনো অ্যাকাউন্ট, সাবস্ক্রিপশন বা কার্ড লাগে না। এই সেবা কোনো যাচাইয়ের ফলাফলের উপর নির্ভর করে না — এটি সম্পূর্ণ স্বাধীনভাবে কাজ করে।",
  "a.languages": "আমি এই ভাষাগুলোতে কথা বলতে পারি: {languages}। এই প্যানেলের উপরের ভাষা মেনু থেকে একটি বেছে নিন।",
  "a.changeLanguage": "এই প্যানেলের উপরের মেনু থেকে একটি ভাষা বেছে নিন।",
  "a.fallback": "এর উত্তর এখনো আমার কাছে নেই। আমি এই বিষয়গুলোতে সাহায্য করতে পারি:",
  "a.languageChanged": "হয়ে গেছে — এখন থেকে আমি বাংলায় উত্তর দেব।",
  "action.tryNow": "এখনই চেষ্টা করুন",
  "action.yesExplain": "হ্যাঁ, ব্যাখ্যা করুন",
  "action.noThanks": "না, ধন্যবাদ",
  "scan.website":
    "আমি আপনার জন্য ওয়েবসাইটটি স্ক্যান করছি। সাধারণত কয়েক সেকেন্ড লাগে। আমি SSL সার্টিফিকেট, DNS রেকর্ড এবং হুমকি ডেটাবেস পরীক্ষা করছি।",
  "scan.product":
    "আমি আপনার জন্য পণ্যটি পরীক্ষা করছি। আমি IMEI বা বারকোডের চেক ডিজিটের মতো শনাক্তকারী যাচাই করে নির্মাতার রেকর্ডের সঙ্গে মিলিয়ে দেখি।",
  "scan.claim": "আমি আপনার জন্য দাবিটি যাচাই করছি। আমি এটিকে যাচাইযোগ্য বক্তব্যে ভাগ করে প্রকাশিত ফ্যাক্ট-চেক খুঁজছি।",
  "scan.media": "আমি আপনার জন্য ছবিটি পরীক্ষা করছি। আমি এর মেটাডেটা, ফাইলের গঠন এবং কনটেন্ট ক্রেডেনশিয়াল পড়ছি।",
  "scan.auto": "আমি আপনার ইনপুট বিশ্লেষণ করছি। প্রথমে ঠিক করি কোন ধরনের যাচাই উপযুক্ত, তারপর প্রমাণ সংগ্রহ করি।",
  "scan.done": "স্ক্যান সম্পূর্ণ। ফলাফল: {verdict}।",
  "scan.failed": "স্ক্যানটি সম্পূর্ণ করা যায়নি।",
  "scan.askExplain": "এই ফলাফলের মানে কী, তা কি আমি ব্যাখ্যা করব?",
  "verdict.ok": "কম ঝুঁকি",
  "verdict.warn": "সন্দেহজনক",
  "verdict.risk": "উচ্চ ঝুঁকি",
  "verdict.unknown": "অনির্ধারিত — যথেষ্ট প্রমাণ নেই",
  "explain.risk":
    "উচ্চ ঝুঁকি মানে প্রমাণ আপনার ইনপুটের বিপরীত, অথবা পরিচিত সতর্ক সংকেতের সঙ্গে মিলে যায়। সেখানে পাসওয়ার্ড বা পেমেন্টের তথ্য দেবেন না। প্রতিটি ফলাফল ও তার উৎস দেখতে পুরো রিপোর্টটি খুলুন।",
  "explain.error":
    "ইঞ্জিন যাচাই সম্পূর্ণ করতে পারেনি। প্রায়ই সাইটটি সাড়া দেয়নি, ইনপুট খুব ছোট ছিল, অথবা অনুরোধের সীমা পূর্ণ হয়েছে। ইনপুট দেখে এক মিনিট পরে আবার চেষ্টা করুন।",
  "explain.no": "ঠিক আছে। দরকার হলে আমি এখানেই আছি।",
};

const DICTIONARIES: Record<ChatLang, Dictionary> = { en: EN, es: ES, fr: FR, de: DE, "zh-Hans": ZH, ar: AR, hi: HI, ru: RU, bn: BN };

/**
 * Looks up `key` in `lang` (English fallback) and fills `{name}` placeholders.
 * `{app}` and `{assistant}` always resolve to this deployment's configured
 * identity, so no dictionary string names a product or company.
 */
export function t(lang: ChatLang, key: MessageKey, params: Record<string, string> = {}) {
  const template = DICTIONARIES[lang]?.[key] ?? EN[key];
  const merged: Record<string, string> = {
    app: identity().appName,
    assistant: identity().roboName,
    ...params,
  };
  return template.replace(/\{(\w+)\}/g, (match, name: string) => merged[name] ?? match);
}

/* --------------------------------- intents -------------------------------- */

export type Intent = "greeting" | "free" | "languages" | "verifyWebsite" | "howWorks" | "whatIs";

// Checked across every language, so a visitor can type in any of them. Order
// breaks ties: the more specific intents come first.
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  greeting: ["hello", "hi", "hey", "hola", "bonjour", "salut", "hallo", "你好", "مرحبا", "السلام", "नमस्ते", "привет", "здравствуй", "হ্যালো", "নমস্কার", "আসসালামু"],
  free: [
    "free", "cost", "price", "pay", "charge", "subscription", "gratis", "gratuit", "precio", "cuesta", "pagar", "prix", "coût", "payer",
    "kostenlos", "preis", "kosten", "bezahlen", "免费", "价格", "费用", "收费", "مجاني", "مجانية", "سعر", "تكلفة",
    "मुफ़्त", "मुफ्त", "कीमत", "शुल्क", "бесплат", "цена", "стоимост", "платн", "বিনামূল্যে", "ফ্রি", "দাম", "খরচ",
  ],
  languages: [
    "language", "speak", "translate", "idioma", "hablas", "lengua", "langue", "parlez", "sprache", "sprichst", "语言", "翻译",
    "لغة", "اللغات", "لغات", "भाषा", "язык", "ভাষা",
  ],
  verifyWebsite: [
    "website", "site", "url", "link", "domain", "phishing", "sitio", "página", "enlace", "dominio", "lien", "domaine", "webseite", "seite",
    "网站", "网址", "链接", "域名", "موقع", "رابط", "نطاق", "वेबसाइट", "साइट", "लिंक", "डोमेन", "сайт", "ссылк", "домен",
    "ওয়েবসাইট", "সাইট", "লিংক", "ডোমেইন",
  ],
  howWorks: [
    "how does", "how do you", "work", "verification", "evidence", "process", "funciona", "verificación", "pruebas", "fonctionne", "vérification",
    "funktioniert", "prüfung", "如何", "怎么", "工作", "验证", "كيف", "يعمل", "التحقق", "कैसे", "काम", "जाँच", "работает", "проверк",
    "কীভাবে", "কাজ", "যাচাই",
  ],
  whatIs: [
    "what is", "what's", "who are you", "about", "qué es", "quién eres", "qu'est", "c'est quoi", "was ist", "wer bist",
    "是什么", "你是谁", "ما هو", "من أنت", "क्या है", "आप कौन", "что такое", "кто вы", "আপনি কে",
  ],
};

const LATIN = /^[a-z0-9' ]+$/;

function keywordMatches(text: string, keyword: string) {
  if (!LATIN.test(keyword)) return text.includes(keyword);
  // Latin keywords match at a word start (so stems like "bezahl" work); short
  // ones must be whole words, or "hi" would match "high".
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = keyword.length <= 3 ? "([^a-z]|$)" : "";
  return new RegExp(`(^|[^a-z])${escaped}${end}`).test(text);
}

/**
 * Best-matching intent for free text in any supported language, or null.
 * Naming the product or the assistant (whatever this deployment calls them)
 * counts as asking what it is.
 */
export function matchIntent(text: string): Intent | null {
  const normalized = text.toLowerCase().normalize("NFC");
  const id = identity();
  const ownNames = `${id.appName} ${id.shortName} ${id.roboName}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
  let best: Intent | null = null;
  let bestScore = 0;
  for (const [intent, baseKeywords] of Object.entries(INTENT_KEYWORDS) as Array<[Intent, string[]]>) {
    const keywords = intent === "whatIs" ? [...baseKeywords, ...ownNames] : baseKeywords;
    const score = keywords.filter((kw) => keywordMatches(normalized, kw)).length;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best;
}
