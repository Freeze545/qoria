/**
 * Qoria lightweight UI i18n (FR + EN).
 * Detection: localStorage 'qoria_lang' override → navigator.language (en* → en, else fr).
 * Apply via data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria / data-i18n-html
 * and data-i18n-prompt (updates data-prompt). Toggle: [data-lang-toggle].
 */
(function (global) {
  const STORAGE_KEY = 'qoria_lang';

  const dict = {
    fr: {
      // ——— Shared chrome ———
      'nav.pricing': 'Tarifs',
      'nav.login': 'Connexion',
      'nav.signup': 'Commencer',
      'nav.app': 'App',
      'nav.register': 'S’inscrire',
      'meta.desc.home':
        'Qoria : chat, voix, images, fichiers et mémoire. Interface premium sur tous les appareils. Répond dans ta langue. Free généreux · Pro avec plafond hebdo soft.',
      'meta.desc.app': 'Qoria — IA généraliste sur tous les appareils. Répond dans ta langue.',
      'title.home': 'Qoria — Ton IA pour tout',
      'title.pricing': 'Tarifs — Qoria',
      'title.login': 'Connexion — Qoria',
      'title.signup': 'Créer un compte — Qoria',
      'title.app': 'Qoria',

      // ——— Landing ———
      'home.badge': '✦ IA généraliste · Pour tout le monde · Toutes plateformes',
      'home.h1': 'Réfléchis, crée et avance — avec une IA à ton image.',
      'home.lead':
        'Chat, appel vocal, images, fichiers et mémoire. Interface premium sur web, téléphone et ordi. Qoria répond dans ta langue. Plusieurs modèles sous le capot, un seul nom\u00a0: Qoria.',
      'home.cta.signup': 'Créer un compte gratuit',
      'home.cta.pricing': 'Voir Free & Pro',
      'home.demo.user': 'Résume-moi ça comme si j’avais 12 ans.',
      'home.demo.ai':
        'OK — imagine un casse-tête. Qoria te montre les pièces une à une, sans jargon, jusqu’à ce que ça clique.',
      'home.features.label': 'Capacités',
      'home.features.title': 'Tout ce dont tu as besoin, au même endroit',
      'home.f.chat.h': 'Chat intelligent',
      'home.f.chat.p': 'Questions, raisonnement et aide au quotidien — clair, naturel, dans ta langue.',
      'home.f.voice.h': 'Appel vocal',
      'home.f.voice.p': 'Parle à Qoria et entends la réponse à voix haute. Mode conversation mains libres.',
      'home.f.img.h': 'Images',
      'home.f.img.p':
        'Visuels en un prompt — 3/jour en Free. Pro\u00a0: usage normal sans friction, plafond hebdo généreux.',
      'home.f.files.h': 'Fichiers & vision',
      'home.f.files.p': 'Photo, PDF ou texte — Qoria lit, analyse et répond.',
      'home.f.mem.h': 'Mémoire perso',
      'home.f.mem.p': 'Des faits sur toi, réinjectés dans les réponses. Tu contrôles tout.',
      'home.f.route.h': 'Routeur malin',
      'home.f.route.p':
        'Groq par défaut pour le coût. Escalade premium seulement quand c’est vraiment complexe.',
      'home.pricing.label': 'Tarifs',
      'home.pricing.title': 'Simple. Honnête.',
      'home.pricing.lead':
        'Free pour explorer. Pro pour créer beaucoup plus — avec un plafond hebdo généreux pour rester stable.',
      'home.free.price': '0 $<span> / mois</span>',
      'home.free.li1': 'Chat illimité',
      'home.free.li2': 'Appel vocal',
      'home.free.li3': '3 images / jour',
      'home.free.li4': '1 vidéo courte / jour*',
      'home.free.li5': 'Mémoire & fichiers',
      'home.free.cta': 'S’inscrire',
      'home.pro.price': '20 $<span> / mois</span>',
      'home.pro.li1': 'Chat & médias très généreux',
      'home.pro.li2': 'Plafond hebdo soft (reset lundi)',
      'home.pro.li3': 'Mode ensemble (2 modèles)',
      'home.pro.li4': 'Priorité modèles premium*',
      'home.pro.li5': 'Support prioritaire',
      'home.pro.badge': 'Recommandé',
      'home.pro.cta': 'Passer à Pro',
      'home.pro.note':
        '*selon les clés API branchées · *vidéo quand le fournisseur est configuré · Pro n’est pas « sans limite absolue » — un plafond hebdo protège la qualité du service. Essai Pro 7 jours (carte plus tard) — bientôt.',
      'home.footer':
        '© Qoria · Orchestration de modèles cloud — pas un modèle entraîné maison.<br />Comptes locaux · mots de passe hachés · pas de revente de données.<br /><span class="footer-hint">Web · téléphone · ordi — ajoute à l’écran d’accueil depuis ton navigateur.</span>',

      // ——— Pricing page ———
      'pricing.label': 'Tarifs',
      'pricing.title': 'Free & Pro',
      'pricing.lead':
        'Free pour explorer. Pro pour créer beaucoup plus — avec un <strong style="color:var(--text);font-weight:600">plafond hebdo généreux</strong> qui garde le service stable (comme un cap soft, pas un mur quotidien).',
      'pricing.free.price': '0 $<span>/mois</span>',
      'pricing.free.li1': 'Chat illimité',
      'pricing.free.li2': 'Appel vocal',
      'pricing.free.li3': '3 créations d’image / jour',
      'pricing.free.li4': '1 vidéo courte / jour*',
      'pricing.free.li5': 'Mémoire & fichiers',
      'pricing.free.note':
        '*Vidéo excellente = clé fournisseur (fal / Pollinations / Runway / Luma / Sora). Pas de chemin gratuit excellent.',
      'pricing.free.cta': 'Continuer gratuit',
      'pricing.pro.price': '20 $<span>/mois</span>',
      'pricing.pro.li1': 'Chat & médias très généreux au quotidien',
      'pricing.pro.li2': 'Plafond hebdo soft — reset chaque lundi',
      'pricing.pro.li3': 'Mode ensemble (2 modèles)',
      'pricing.pro.li4': 'Priorité aux modèles premium*',
      'pricing.pro.li5': 'Support prioritaire',
      'pricing.pro.note':
        'Usage normal = tu ne le remarques pas. Si tu touches le plafond\u00a0: «\u00a0Limite hebdo Pro atteinte — revient lundi\u00a0».',
      'pricing.pro.badge': 'Recommandé',
      'pricing.pro.cta': 'Passer à Pro',
      'pricing.stripe':
        'Stripe s’active dès que STRIPE_PRICE_ID est configuré. En mode test, Pro peut s’activer sans débit réel.<br /><strong style="color:var(--muted);font-weight:600">Bientôt</strong> — essai Pro 7 jours (carte enregistrée plus tard). Images & vidéo premium dépendent des clés API branchées; sans clé payante, la qualité média reste honnête, pas magique.',
      'pricing.bill.proOk': 'Pro activé (test).',
      'pricing.bill.stub': 'Stub — configure Stripe.',

      // ——— Auth ———
      'login.h1': 'Bon retour',
      'login.sub': 'Reconnecte-toi pour continuer où tu étais.',
      'login.email': 'Courriel',
      'login.password': 'Mot de passe',
      'login.submit': 'Se connecter',
      'login.footer': 'Pas de compte ? <a href="/signup.html">Créer un compte</a>',
      'login.err': 'Erreur',
      'signup.h1': 'Créer un compte',
      'signup.sub':
        'Gratuit · chat illimité · 3 images / jour · 1 vidéo / jour. Pro plus tard si tu veux aller plus loin.',
      'signup.name': 'Prénom',
      'signup.email': 'Courriel',
      'signup.password': 'Mot de passe',
      'signup.submit': 'Commencer avec Qoria',
      'signup.footer': 'Déjà inscrit ? <a href="/login.html">Connexion</a>',
      'signup.err': 'Erreur',

      // ——— App chrome ———
      'app.new': '＋ Nouvelle conversation',
      'app.usageLoading': 'Usage…',
      'app.memory': 'Mémoire',
      'app.models': 'Modèles',
      'app.pricing': 'Tarifs Pro',
      'app.logout': 'Déconnexion',
      'app.menu': 'Menu',
      'app.memTitle': 'Mémoire',
      'app.proCta': '<strong>Pro</strong> — plus d’images &amp; vidéo, plafond hebdo généreux',
      'app.proCtaLink': 'Voir →',
      'app.empty.h2': 'Salut, je suis Qoria',
      'app.empty.p':
        'Pose une question, lance un appel vocal, génère une image, ou joins un fichier. Clair, direct — Qoria répond dans ta langue.',
      'app.sug.explain': 'Expliquer simplement',
      'app.sug.explain.prompt': 'Explique-moi la photosynthèse simplement',
      'app.sug.write': 'Écrire un message',
      'app.sug.write.prompt': 'Écris un message poli pour reporter une réunion',
      'app.sug.image': 'Créer une image',
      'app.sug.image.prompt': 'Generate an image: quiet morning café, soft golden light, cinematic',
      'app.sug.plan': 'Planifier ma semaine',
      'app.sug.plan.prompt': 'Aide-moi à planifier ma semaine',
      'app.attach.remove': 'Retirer',
      'app.input.ph': 'Écris à Qoria…',
      'app.attach': 'Joindre un fichier',
      'app.mode.chat': 'Chat',
      'app.mode.image': 'Image',
      'app.mode.ensemble': 'Ensemble',
      'app.mode.video': 'Vidéo',
      'app.mic': 'Dicter',
      'app.voice': 'Appel vocal',
      'app.send': 'Envoyer',
      'app.mem.modal.h': 'Mémoire personnelle',
      'app.mem.modal.p': 'Faits injectés dans le prompt système. Tu contrôles tout.',
      'app.mem.ph': 'Ex. I live in Toronto / J’habite à Paris',
      'app.mem.add': 'Ajouter',
      'app.mem.clear': 'Tout effacer',
      'app.mem.close': 'Fermer',
      'app.prov.modal.h': 'Fournisseurs de modèles',
      'app.prov.modal.p':
        'Qoria route automatiquement. « Connecté » = clé présente + test réel OK.',
      'app.prov.smoke': 'Relancer les tests',
      'app.prov.close': 'Fermer',
      'app.proGate.title': 'Qoria Pro',
      'app.proGate.msg': 'Fonction Pro — passe à Pro pour débloquer',
      'app.proGate.pricing': 'Voir les tarifs',
      'app.proGate.close': 'Fermer',
      'app.voice.title': 'Appel Qoria',
      'app.voice.status': 'Préparation…',
      'app.voice.end': 'Terminer',
      'app.voice.bargeHint': 'L’interruption (barge-in) fonctionne mieux dans Chrome.',

      // ——— app.js dynamic ———
      'js.proGate.default': 'Fonction Pro — passe à Pro pour débloquer',
      'js.sessionExpired': 'Session expirée — reconnecte-toi.',
      'js.notLoggedIn': 'Non connecté',
      'js.errorStatus': 'Erreur {n}',
      'js.usage.pro': 'Pro · plafond hebdo généreux (reset lundi)',
      'js.usage.free': 'Images : {img}/{imgLim} · Vidéo : {vid}/{vidLim} · Free',
      'js.usage.freeExtra': ' · chat illimité · Pro = plus généreux',
      'js.conv.empty': 'Aucune conversation pour l’instant. Lance-en une.',
      'js.conv.fallback': 'Conversation',
      'js.img.sent': 'image envoyée',
      'js.video.proNeedKey':
        'Vidéo excellente : clé payante requise (fal ≈0,05–0,10$/clip, Pollinations Pollen, Runway, Luma ou Sora). Aucun chemin gratuit viable.',
      'js.video.freeNeedKey':
        'Vidéo : Free = 1/jour · Pro = plafond hebdo généreux, dès qu’une clé fournisseur est branchée. Pas de chemin gratuit excellent — fal / Pollinations / Runway / Luma / Sora.',
      'js.video.proNeedKeyShort':
        'Vidéo excellente : clé payante requise (fal / Pollinations / Runway / Luma / Sora).',
      'js.video.freeNeedKeyShort':
        'Vidéo : Free = 1/jour · Pro = plafond hebdo généreux une fois branchée. Pas de chemin gratuit excellent.',
      'js.upload.fail': 'Upload échoué',
      'js.file': 'Fichier',
      'js.speech.unsupported':
        'Reconnaissance vocale non supportée sur ce navigateur (limite Safari fréquente).',
      'js.weeklyCap': 'Plafond hebdo',
      'js.weeklyLimit': 'Limite hebdo Pro atteinte — revient lundi',
      'js.freeLimit': 'Limite Free atteinte — Pro offre un plafond hebdo généreux',
      'js.video.needPaid':
        'Vidéo : clé fournisseur payante requise. Free = 1/jour · Pro = plafond hebdo généreux.',
      'js.error': 'Erreur',
      'js.video.defaultPrompt': 'une courte vidéo cinématique',
      'js.video.thinking': 'Génération de la vidéo… (peut prendre 1–2 min)',
      'js.video.here': 'Voici ta vidéo:',
      'js.video.generated': 'Vidéo générée: ',
      'js.video.unavailable': 'Vidéo non disponible.',
      'js.image.defaultPrompt': 'une image abstraite indigo et violet',
      'js.image.thinking': 'Génération de l’image…',
      'js.image.none': 'Pas d’image renvoyée — ton quota n’a pas été consommé. Réessaie.',
      'js.image.here': 'Voici ton image:',
      'js.image.generated': 'Image générée: ',
      'js.analyze.image': 'Analyse cette image.',
      'js.analyze.doc': 'Analyse ce document.',
      'js.file.label': 'Fichier: ',
      'js.file.header': 'Fichier ({name}):',
      'js.thinking': 'Qoria réfléchit…',
      'js.mem.empty': 'Aucune mémoire.',
      'js.mem.clearConfirm': 'Effacer toute la mémoire ?',
      'js.prov.ok': 'connecté',
      'js.prov.missing': 'clé manquante',
      'js.prov.testing': 'Test…',
      'js.prov.retest': 'Relancer les tests',
      'js.call.speaking': 'Qoria parle…',
      'js.call.thinking': 'Qoria réfléchit…',
      'js.call.error': 'Une erreur est survenue.',
      'js.call.srUnsupported': 'Reconnaissance vocale non supportée sur ce navigateur.',
      'js.call.yourTurn': 'À toi — parle maintenant',
      'js.call.unsupported': 'Appel vocal non supporté sur ce navigateur (essaie Chrome).',
      'js.call.ttsUnsupported': 'Synthèse vocale non supportée sur ce navigateur.',
      'js.call.sayHi': 'Dis bonjour à Qoria…',
      'js.call.greeting': 'Allô, c’est Qoria. Je t’écoute.',
      'js.call.preparing': 'Préparation…',
    },

    en: {
      'nav.pricing': 'Pricing',
      'nav.login': 'Log in',
      'nav.signup': 'Get started',
      'nav.app': 'App',
      'nav.register': 'Sign up',
      'meta.desc.home':
        'Qoria: chat, voice, images, files and memory. Premium UI on every device. Replies in your language. Free generous · Pro with soft weekly caps.',
      'meta.desc.app': 'Qoria — generalist AI chat on every device. Replies in your language.',
      'title.home': 'Qoria — Your AI for everything',
      'title.pricing': 'Pricing — Qoria',
      'title.login': 'Log in — Qoria',
      'title.signup': 'Create an account — Qoria',
      'title.app': 'Qoria',

      'home.badge': '✦ Generalist AI · For everyone · Every platform',
      'home.h1': 'Think, create, and move forward — with AI that fits you.',
      'home.lead':
        'Chat, voice calls, images, files, and memory. Premium UI on web, phone, and desktop. Qoria replies in your language. Several models under the hood, one name: Qoria.',
      'home.cta.signup': 'Create a free account',
      'home.cta.pricing': 'See Free & Pro',
      'home.demo.user': 'Summarize this like I’m 12.',
      'home.demo.ai':
        'OK — picture a puzzle. Qoria shows you the pieces one by one, no jargon, until it clicks.',
      'home.features.label': 'Capabilities',
      'home.features.title': 'Everything you need, in one place',
      'home.f.chat.h': 'Smart chat',
      'home.f.chat.p': 'Questions, reasoning, and everyday help — clear, natural, in your language.',
      'home.f.voice.h': 'Voice call',
      'home.f.voice.p': 'Talk to Qoria and hear the reply out loud. Hands-free conversation mode.',
      'home.f.img.h': 'Images',
      'home.f.img.p':
        'Visuals from a prompt — 3/day on Free. Pro: normal use without friction, generous weekly cap.',
      'home.f.files.h': 'Files & vision',
      'home.f.files.p': 'Photo, PDF, or text — Qoria reads, analyzes, and replies.',
      'home.f.mem.h': 'Personal memory',
      'home.f.mem.p': 'Facts about you, reinjected into answers. You’re in control.',
      'home.f.route.h': 'Smart router',
      'home.f.route.p':
        'Groq by default for cost. Premium escalation only when it’s truly complex.',
      'home.pricing.label': 'Pricing',
      'home.pricing.title': 'Simple. Honest.',
      'home.pricing.lead':
        'Free to explore. Pro to create a lot more — with a generous weekly cap to stay stable.',
      'home.free.price': '$0<span> / month</span>',
      'home.free.li1': 'Unlimited chat',
      'home.free.li2': 'Voice call',
      'home.free.li3': '3 images / day',
      'home.free.li4': '1 short video / day*',
      'home.free.li5': 'Memory & files',
      'home.free.cta': 'Sign up',
      'home.pro.price': '$20<span> / month</span>',
      'home.pro.li1': 'Very generous chat & media',
      'home.pro.li2': 'Soft weekly cap (resets Monday)',
      'home.pro.li3': 'Ensemble mode (2 models)',
      'home.pro.li4': 'Priority premium models*',
      'home.pro.li5': 'Priority support',
      'home.pro.badge': 'Recommended',
      'home.pro.cta': 'Upgrade to Pro',
      'home.pro.note':
        '*depends on connected API keys · *video when a provider is configured · Pro is not “absolutely unlimited” — a weekly cap protects service quality. 7-day Pro trial (card later) — coming soon.',
      'home.footer':
        '© Qoria · Cloud model orchestration — not a home-trained model.<br />Local accounts · hashed passwords · no data resale.<br /><span class="footer-hint">Web · phone · desktop — add to home screen from your browser.</span>',

      'pricing.label': 'Pricing',
      'pricing.title': 'Free & Pro',
      'pricing.lead':
        'Free to explore. Pro to create a lot more — with a <strong style="color:var(--text);font-weight:600">generous weekly cap</strong> that keeps the service stable (a soft cap, not a daily wall).',
      'pricing.free.price': '$0<span>/mo</span>',
      'pricing.free.li1': 'Unlimited chat',
      'pricing.free.li2': 'Voice call',
      'pricing.free.li3': '3 image creations / day',
      'pricing.free.li4': '1 short video / day*',
      'pricing.free.li5': 'Memory & files',
      'pricing.free.note':
        '*Excellent video = provider key (fal / Pollinations / Runway / Luma / Sora). No excellent free path.',
      'pricing.free.cta': 'Continue free',
      'pricing.pro.price': '$20<span>/mo</span>',
      'pricing.pro.li1': 'Very generous daily chat & media',
      'pricing.pro.li2': 'Soft weekly cap — resets every Monday',
      'pricing.pro.li3': 'Ensemble mode (2 models)',
      'pricing.pro.li4': 'Priority on premium models*',
      'pricing.pro.li5': 'Priority support',
      'pricing.pro.note':
        'Normal use = you barely notice. If you hit the cap: “Pro weekly limit reached — come back Monday.”',
      'pricing.pro.badge': 'Recommended',
      'pricing.pro.cta': 'Upgrade to Pro',
      'pricing.stripe':
        'Stripe turns on once STRIPE_PRICE_ID is set. In test mode, Pro can activate with no real charge.<br /><strong style="color:var(--muted);font-weight:600">Coming soon</strong> — 7-day Pro trial (card saved later). Premium images & video depend on connected API keys; without a paid key, media quality stays honest, not magical.',
      'pricing.bill.proOk': 'Pro activated (test).',
      'pricing.bill.stub': 'Stub — configure Stripe.',

      'login.h1': 'Welcome back',
      'login.sub': 'Log in to pick up where you left off.',
      'login.email': 'Email',
      'login.password': 'Password',
      'login.submit': 'Log in',
      'login.footer': 'No account? <a href="/signup.html">Create one</a>',
      'login.err': 'Error',
      'signup.h1': 'Create an account',
      'signup.sub':
        'Free · unlimited chat · 3 images / day · 1 video / day. Pro later if you want to go further.',
      'signup.name': 'First name',
      'signup.email': 'Email',
      'signup.password': 'Password',
      'signup.submit': 'Start with Qoria',
      'signup.footer': 'Already registered? <a href="/login.html">Log in</a>',
      'signup.err': 'Error',

      'app.new': '＋ New conversation',
      'app.usageLoading': 'Usage…',
      'app.memory': 'Memory',
      'app.models': 'Models',
      'app.pricing': 'Pro pricing',
      'app.logout': 'Log out',
      'app.menu': 'Menu',
      'app.memTitle': 'Memory',
      'app.proCta': '<strong>Pro</strong> — more images &amp; video, generous weekly cap',
      'app.proCtaLink': 'See →',
      'app.empty.h2': 'Hi, I’m Qoria',
      'app.empty.p':
        'Ask a question, start a voice call, generate an image, or attach a file. Clear, direct — Qoria replies in your language.',
      'app.sug.explain': 'Explain simply',
      'app.sug.explain.prompt': 'Explain photosynthesis simply',
      'app.sug.write': 'Write a message',
      'app.sug.write.prompt': 'Write a polite message to reschedule a meeting',
      'app.sug.image': 'Create an image',
      'app.sug.image.prompt': 'Generate an image: quiet morning café, soft golden light, cinematic',
      'app.sug.plan': 'Plan my week',
      'app.sug.plan.prompt': 'Help me plan my week',
      'app.attach.remove': 'Remove',
      'app.input.ph': 'Message Qoria…',
      'app.attach': 'Attach a file',
      'app.mode.chat': 'Chat',
      'app.mode.image': 'Image',
      'app.mode.ensemble': 'Ensemble',
      'app.mode.video': 'Video',
      'app.mic': 'Dictate',
      'app.voice': 'Voice call',
      'app.send': 'Send',
      'app.mem.modal.h': 'Personal memory',
      'app.mem.modal.p': 'Facts injected into the system prompt. You’re in control.',
      'app.mem.ph': 'e.g. I live in Toronto / J’habite à Paris',
      'app.mem.add': 'Add',
      'app.mem.clear': 'Clear all',
      'app.mem.close': 'Close',
      'app.prov.modal.h': 'Model providers',
      'app.prov.modal.p':
        'Qoria routes automatically. “Connected” = key present + real test OK.',
      'app.prov.smoke': 'Re-run tests',
      'app.prov.close': 'Close',
      'app.proGate.title': 'Qoria Pro',
      'app.proGate.msg': 'Pro feature — upgrade to Pro to unlock',
      'app.proGate.pricing': 'See pricing',
      'app.proGate.close': 'Close',
      'app.voice.title': 'Qoria call',
      'app.voice.status': 'Preparing…',
      'app.voice.end': 'End',
      'app.voice.bargeHint': 'Barge-in (interrupt while Qoria speaks) works best in Chrome.',

      'js.proGate.default': 'Pro feature — upgrade to Pro to unlock',
      'js.sessionExpired': 'Session expired — please log in again.',
      'js.notLoggedIn': 'Not signed in',
      'js.errorStatus': 'Error {n}',
      'js.usage.pro': 'Pro · generous weekly cap (resets Monday)',
      'js.usage.free': 'Images: {img}/{imgLim} · Video: {vid}/{vidLim} · Free',
      'js.usage.freeExtra': ' · unlimited chat · Pro = more generous',
      'js.conv.empty': 'No conversations yet. Start one.',
      'js.conv.fallback': 'Conversation',
      'js.img.sent': 'sent image',
      'js.video.proNeedKey':
        'Excellent video: paid provider key required (fal ≈$0.05–0.10/clip, Pollinations Pollen, Runway, Luma, or Sora). No viable free path.',
      'js.video.freeNeedKey':
        'Video: Free = 1/day · Pro = generous weekly cap once a provider key is connected. No excellent free path — fal / Pollinations / Runway / Luma / Sora.',
      'js.video.proNeedKeyShort':
        'Excellent video: paid key required (fal / Pollinations / Runway / Luma / Sora).',
      'js.video.freeNeedKeyShort':
        'Video: Free = 1/day · Pro = generous weekly cap once connected. No excellent free path.',
      'js.upload.fail': 'Upload failed',
      'js.file': 'File',
      'js.speech.unsupported':
        'Speech recognition not supported in this browser (common Safari limit).',
      'js.weeklyCap': 'Weekly cap',
      'js.weeklyLimit': 'Pro weekly limit reached — come back Monday',
      'js.freeLimit': 'Free limit reached — Pro offers a generous weekly cap',
      'js.video.needPaid':
        'Video: paid provider key required. Free = 1/day · Pro = generous weekly cap.',
      'js.error': 'Error',
      'js.video.defaultPrompt': 'a short cinematic video',
      'js.video.thinking': 'Generating video… (may take 1–2 min)',
      'js.video.here': 'Here’s your video:',
      'js.video.generated': 'Generated video: ',
      'js.video.unavailable': 'Video unavailable.',
      'js.image.defaultPrompt': 'an abstract indigo and violet image',
      'js.image.thinking': 'Generating image…',
      'js.image.none': 'No image returned — your quota was not used. Try again.',
      'js.image.here': 'Here’s your image:',
      'js.image.generated': 'Generated image: ',
      'js.analyze.image': 'Analyze this image.',
      'js.analyze.doc': 'Analyze this document.',
      'js.file.label': 'File: ',
      'js.file.header': 'File ({name}):',
      'js.thinking': 'Qoria is thinking…',
      'js.mem.empty': 'No memories yet.',
      'js.mem.clearConfirm': 'Clear all memory?',
      'js.prov.ok': 'connected',
      'js.prov.missing': 'key missing',
      'js.prov.testing': 'Testing…',
      'js.prov.retest': 'Re-run tests',
      'js.call.speaking': 'Qoria is speaking…',
      'js.call.thinking': 'Qoria is thinking…',
      'js.call.error': 'Something went wrong.',
      'js.call.srUnsupported': 'Speech recognition not supported in this browser.',
      'js.call.yourTurn': 'Your turn — speak now',
      'js.call.unsupported': 'Voice call not supported in this browser (try Chrome).',
      'js.call.ttsUnsupported': 'Speech synthesis not supported in this browser.',
      'js.call.sayHi': 'Say hello to Qoria…',
      'js.call.greeting': 'Hi, this is Qoria. I’m listening.',
      'js.call.preparing': 'Preparing…',
    },
  };

  function detectLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'fr') return stored;
    } catch {}
    const nav = String((typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'fr')
      .toLowerCase()
      .replace('_', '-');
    if (nav.startsWith('en')) return 'en';
    return 'fr';
  }

  let lang = detectLang();

  function hasKey(key) {
    return !!(dict[lang] && dict[lang][key] != null) || !!(dict.fr && dict.fr[key] != null);
  }

  function t(key, vars) {
    const table = dict[lang] || dict.fr;
    let s = table[key];
    if (s == null) s = (dict.fr && dict.fr[key]);
    if (s == null) s = key; // callers that expect a string (JS UI)
    if (vars && typeof s === 'string') {
      s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
    }
    return s;
  }

  function localeTag() {
    if (lang === 'en') {
      const nav = String((navigator && navigator.language) || 'en').replace('_', '-');
      return nav.toLowerCase().startsWith('en') ? nav : 'en-US';
    }
    const nav = String((navigator && navigator.language) || 'fr').replace('_', '-');
    return nav.toLowerCase().startsWith('fr') ? nav : 'fr-CA';
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key || !hasKey(key)) return; // keep HTML fallback — never flash raw key
      const val = t(key);
      if (el.tagName === 'TITLE') el.textContent = val;
      else el.textContent = val;
    });
    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (key && hasKey(key)) el.innerHTML = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
    scope.querySelectorAll('[data-i18n-prompt]').forEach((el) => {
      const key = el.getAttribute('data-i18n-prompt');
      if (key) el.setAttribute('data-prompt', t(key));
    });
    // meta description
    scope.querySelectorAll('meta[data-i18n-content]').forEach((el) => {
      const key = el.getAttribute('data-i18n-content');
      if (key) el.setAttribute('content', t(key));
    });
    document.documentElement.lang = lang === 'en' ? 'en' : 'fr';
    document.querySelectorAll('[data-lang-toggle]').forEach((wrap) => {
      wrap.querySelectorAll('[data-set-lang]').forEach((btn) => {
        const l = btn.getAttribute('data-set-lang');
        btn.classList.toggle('active', l === lang);
        btn.setAttribute('aria-pressed', l === lang ? 'true' : 'false');
      });
    });
    try {
      document.dispatchEvent(new CustomEvent('qoria:lang', { detail: { lang } }));
    } catch {}
  }

  function setLang(next) {
    if (next !== 'en' && next !== 'fr') return;
    lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
    apply();
  }

  function bindToggles(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-set-lang]').forEach((btn) => {
      if (btn._qoriaLangBound) return;
      btn._qoriaLangBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const l = btn.getAttribute('data-set-lang');
        if (l) setLang(l);
      });
    });
  }

  function mountToggleInto(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.querySelector('[data-lang-toggle]')) return;
      const wrap = document.createElement('div');
      wrap.className = 'lang-toggle';
      wrap.setAttribute('data-lang-toggle', '');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Language');
      wrap.innerHTML =
        '<button type="button" class="lang-btn" data-set-lang="fr" aria-pressed="false">FR</button>' +
        '<button type="button" class="lang-btn" data-set-lang="en" aria-pressed="false">EN</button>';
      el.insertBefore(wrap, el.firstChild);
    });
  }

  function boot() {
    mountToggleInto('.nav-actions');
    // Auth pages: put toggle top-right
    if (!document.querySelector('.nav-actions') && document.querySelector('.auth-wrap')) {
      if (!document.querySelector('[data-lang-toggle]')) {
        const wrap = document.createElement('div');
        wrap.className = 'lang-toggle lang-toggle-fixed';
        wrap.setAttribute('data-lang-toggle', '');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'Language');
        wrap.innerHTML =
          '<button type="button" class="lang-btn" data-set-lang="fr">FR</button>' +
          '<button type="button" class="lang-btn" data-set-lang="en">EN</button>';
        document.body.appendChild(wrap);
      }
    }
    // App sidebar foot: small toggle above logout
    const sideFoot = document.querySelector('.side-foot');
    if (sideFoot && !sideFoot.querySelector('[data-lang-toggle]')) {
      const wrap = document.createElement('div');
      wrap.className = 'lang-toggle lang-toggle-side';
      wrap.setAttribute('data-lang-toggle', '');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Language');
      wrap.innerHTML =
        '<button type="button" class="lang-btn" data-set-lang="fr">FR</button>' +
        '<button type="button" class="lang-btn" data-set-lang="en">EN</button>';
      sideFoot.insertBefore(wrap, sideFoot.firstChild);
    }
    bindToggles();
    apply();
    try { document.documentElement.classList.add('i18n-ready'); } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.QoriaI18n = {
    t,
    getLang: () => lang,
    setLang,
    apply,
    localeTag,
    detectLang,
  };
})(typeof window !== 'undefined' ? window : globalThis);
