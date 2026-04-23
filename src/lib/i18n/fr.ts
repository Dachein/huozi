export const fr = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "Commencer",
  "nav.signIn": "Connexion",
  "nav.workspace": "Workspace",
  "nav.signUp": "Inscription",
  "nav.docs": "Docs",
  "nav.cloud": "Cloud",
  "nav.edge": "Edge",
  "nav.blog": "Blog",

  // Home hero
  "home.title1": "Le verbe porte la voie",
  "home.title2.highlight": "Huozi",
  "home.title2.rest": ", le vecteur",
  "home.divider": "文",
  "home.subtitle1": "Un disque cloud pour agents.",
  "home.subtitle2": "Parle le dialecte d'outils-fichier de Claude Code. Montable depuis tout client MCP.",
  "home.cta.start": "Commencer",
  "home.cta.signIn": "Connexion",
  "home.cta.preview": "Aperçu",

  // Home features
  "home.feat1.icon": "云",
  "home.feat1.title": "Disque cloud pour agents",
  "home.feat1.desc": "Montez un workspace via MCP. Les outils Read / Edit / Write / Glob / Grep déjà connus de votre agent fonctionnent — rien à réapprendre.",
  "home.feat2.icon": "器",
  "home.feat2.title": "Bit-exact avec Claude Code",
  "home.feat2.desc": "Mêmes schémas, mêmes codes d'erreur, même cache de session. Claude Code, Cursor, Desktop ou HTTP brut — interchangeables.",
  "home.feat3.icon": "时",
  "home.feat3.title": "Sync live + historique",
  "home.feat3.desc": "Chaque commit est diffusé en ~100 ms à l'UI web. Chaque fichier a un journal complet. Écritures multi-agent atomiques.",

  // Home · deux éditions
  "home.products.label": "Deux éditions",
  "home.products.footnote": "Même surface MCP, même dialecte d'Agent. Choisissez où vivent les octets.",

  "home.cloud.tagline": "Hébergé sur huozi.app. Connexion e-mail, créez un workspace, branchez Claude Code en 60 secondes. Conçu pour les équipes et la collaboration multi-Agent.",
  "home.cloud.bullet1": "Connexion e-mail, multi-utilisateur, clé API par Agent",
  "home.cloud.bullet2": "Synchronisation WebSocket live vers l'UI web",
  "home.cloud.bullet3": "URL de partage publiques avec code à 6 chiffres optionnel",
  "home.cloud.cta": "Explorer Cloud",

  "home.edge.tagline": "Auto-hébergez le même disque sur votre propre compte Cloudflare ou Vercel. Un déployeur, un workspace, zéro Supabase. Licence MIT.",
  "home.edge.bullet1": "Aucune dépendance externe au-delà du runtime edge",
  "home.edge.bullet2": "Auth par collage de clé — pas d'e-mail, pas d'inscription",
  "home.edge.bullet3": "Déploiement en un clic, domaine personnalisé",
  "home.edge.cta": "Explorer Edge",

  // Home · fonctionnalités partagées
  "home.shared.label": "Partagé entre les deux",

  // Home CTA band
  "home.install.title": "Démarrer en 60 secondes",

  // Home code
  "home.code.title": "Monter, écrire un fichier",

  // /cloud hero
  "cloud.hero.tagline1": "Un disque dur natif pour les agents.",
  "cloud.hero.tagline2": "Parle le dialecte d'outils-fichier de Claude Code. Apportez votre propre agent. Les agents écrivent, les humains lisent.",
  "cloud.cta.signIn": "Connexion",
  "cloud.cta.open": "Ouvrir mon workspace",
  "cloud.cta.connectAgent": "Connecter un agent",

  // /workspace — onboarding d'état vide
  "ws.status.title": "Votre workspace",
  "ws.status.connectedAgents": "Agents connectés",
  "ws.status.browserSession": "Session navigateur",
  "ws.status.never": "—",
  "ws.status.now": "à l'instant",
  "ws.status.activeKeys": "clés actives",
  "ws.status.lastActivity": "dernière activité",
  "ws.status.manage": "Gérer",
  "ws.status.connectNew": "Nouvelle connexion",

  // Étiquettes d'expiration de clé (TTL à fenêtre glissante)
  "ws.expiry.never": "n'expire jamais",
  "ws.expiry.expired": "expirée",
  "ws.expiry.inDays": "expire dans {n} jours",
  "ws.expiry.inHours": "expire dans {n} heures",
  "ws.expiry.inMinutes": "expire dans {n} min",
  "ws.expiry.hint": "Fenêtre glissante — chaque requête réinitialise le compteur.",

  // Préréglages TTL
  "ws.ttl.1d": "1 jour",
  "ws.ttl.7d": "7 jours",
  "ws.ttl.30d": "30 jours",
  "ws.ttl.180d": "180 jours",
  "ws.ttl.never": "Jamais",

  // Actions par clé
  "ws.action.copy": "Copier",
  "ws.action.copied": "Copié",
  "ws.action.revoke": "Révoquer",
  "ws.action.revoking": "Révocation…",
  "ws.action.confirmRevoke": "Révoquer « {label} » ? Les Agents utilisant cette clé s'arrêteront immédiatement. Cette action est irréversible.",

  // /workspace — état rempli, intro + cartes d'aide + pied de page
  "ws.filled.intro": "Sélectionnez un fichier dans l'arbre à gauche pour le voir. Markdown et HTML s'affichent de la même façon que sur les pages publiées huozi.app. Les Agents ayant accès à ce workspace peuvent modifier les fichiers à tout moment — ouvrez un fichier et regardez l'onglet historique.",
  "ws.filled.browse.title": "Parcourir",
  "ws.filled.browse.desc": "Utilisez l'arbre (☰ sur mobile). Les dossiers se souviennent de leur état ouvert.",
  "ws.filled.history.title": "Historique",
  "ws.filled.history.desc": "Chaque fichier a un lien Historique listant tous les commits qui l'ont modifié.",
  "ws.filled.search.title": "Rechercher",
  "ws.filled.search.desc": "Filtrez par nom dans la barre au-dessus de l'arbre.",
  "ws.filled.footer.about": "À propos de huozi Cloud",
  "ws.filled.footer.apiDocs": "Référence API",


  "ws.onboard.heading": "Créons quelque chose",
  "ws.onboard.subheading": "Copiez un scénario ci-dessous, collez-le dans votre agent, et regardez le premier fichier apparaître ici en temps réel. Choisissez le format qui vous convient — l'agent s'occupe du reste.",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "Bilan hebdomadaire",
  "ws.onboard.md.scenario": "Note libre — idéal pour écrire, réfléchir, tenir un journal. Affiché en Markdown.",
  "ws.onboard.md.prompt": "Écris-moi un bilan de cette semaine : trois choses livrées, deux choses bloquées, une idée à poursuivre la semaine prochaine. Dans reviews/2026-w17.md, avec titres Markdown et listes courtes.",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "Un tableau de données",
  "ws.onboard.csv.scenario": "Données tabulaires structurées. Affiché comme un tableau triable, facile à étendre ligne par ligne.",
  "ws.onboard.csv.prompt": "Construis un CSV dans data/ai-milestones-2025.csv répertoriant 12 moments marquants d'entreprises IA de l'année écoulée. Colonnes : date, company, event, impact_note. Trier chronologiquement.",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "Une page visuelle",
  "ws.onboard.html.scenario": "Rendu riche — illustrations, graphiques, pages de couverture. Rendu HTML avec assainissement.",
  "ws.onboard.html.prompt": "Crée une belle page HTML de couverture dans cover/movable-type.html sur l'imprimerie à caractères mobiles, avec un dégradé beige chaud, typographie serif, et un court paragraphe expliquant son importance. Ajoute une timeline Echarts simple des inventions clés.",

  "ws.onboard.copy": "Copier le prompt",
  "ws.onboard.copied": "Copié",

  // Home open source
  "home.oss.title": "Open Source",
  "home.oss.desc": "Auto-hébergez votre propre moteur de publication Markdown & HTML. Zéro base de données, juste KV. Licence MIT.",
  "home.oss.deployCF": "Déployer sur Cloudflare",
  "home.oss.deployVercel": "Déployer sur Vercel",
  "home.oss.soon": "bientôt",

  // Home footer
  "home.footer": "Huozi — Typographie mobile pour l'ère de l'IA",

  // Auth
  "auth.login.title": "Connexion à Huozi",
  "auth.login.subtitle": "Entrez votre e-mail. Pas de mot de passe.",
  "auth.login.checkEmail": "Vérifiez votre e-mail pour le code.",
  "auth.login.email": "E-mail",
  "auth.login.code": "Code de vérification",
  "auth.login.sendCode": "Envoyer le code",
  "auth.login.sending": "Envoi...",
  "auth.login.verify": "Vérifier",
  "auth.login.verifying": "Vérification...",
  "auth.login.changeEmail": "Utiliser un autre e-mail",
  "auth.login.newHere": "Nouveau ici ?",
  "auth.login.guide": "Guide de démarrage",

  // Dashboard

  // Dashboard new page

  // Settings
  "settings.title": "Paramètres",
  "settings.subtitle": "Gérez votre espace de travail et vos clés API.",
  "settings.workspace": "Espace de travail",
  "settings.workspaceDesc": "Préfixe URL de votre espace de travail.",
  "settings.apiKeys": "Clés API",
  "settings.apiKeysDesc": "Utilisez les clés API pour publier depuis des agents IA ou des scripts.",
  "settings.apiUsage": "Utilisation de l'API",
  "settings.apiUsageDesc": "Exemple rapide pour publier une page :",
  "settings.getStarted": "Commencer",
  "settings.getStartedDesc": "Apprenez à configurer Claude Code MCP, OpenClaw ou l'API conversationnelle.",
  "settings.viewGuide": "Voir le guide de démarrage",

  // Workspace setup
  "workspace.setup.title": "Configurer l'espace de travail",
  "workspace.setup.desc": "Choisissez un slug unique pour votre espace de travail. Il fera partie des URL de vos pages.",
  "workspace.setup.label": "Slug de l'espace",
  "workspace.setup.placeholder": "votre-nom",
  "workspace.setup.submit": "Créer l'espace",
  "workspace.setup.loading": "Création...",

  // API Key manager
  "apiKey.created": "Clé API créée ! Copiez-la maintenant — elle ne sera plus affichée.",
  "apiKey.copy": "Copier",
  "apiKey.dismiss": "Fermer",
  "apiKey.nameLabel": "Nom de la clé",
  "apiKey.namePlaceholder": "ex. Claude Agent",
  "apiKey.create": "Créer la clé",
  "apiKey.creating": "Création...",
  "apiKey.confirmRevoke": "Révoquer cette clé API ? Cette action est irréversible.",
  "apiKey.neverUsed": "Jamais utilisée",
  "apiKey.lastUsed": "Dernière utilisation",
  "apiKey.revoke": "Révoquer",
  "apiKey.empty": "Pas de clé API. Créez-en une pour publier via l'API.",

  // Conversational install
  "install.copyButton": "Copier pour installer",
  "install.copied": "Copié !",

  // Get started
  "start.title": "Commencer",
  "start.subtitle": "Choisissez votre méthode préférée pour commencer à publier avec Huozi.",
  "start.method1.title": "Installation conversationnelle",
  "start.method1.desc": "Copiez le texte suivant et collez-le dans Claude Code ou tout agent IA. L'agent vous guidera à travers l'inscription, la vérification et la configuration.",
  "start.method1.flow": "Processus :",
  "start.method1.step1": "L'agent demande votre e-mail et mot de passe, appelle l'API d'inscription",
  "start.method1.step2": "Vérifiez votre e-mail, communiquez le code de vérification à l'agent",
  "start.method1.step3": "Après vérification, l'agent demande votre slug d'espace de travail",
  "start.method1.step4": "Espace créé + clé API générée — prêt à l'emploi",
  "start.method2.title": "OpenClaw / ClawHub",
  "start.method3.title": "Claude Code (MCP)",
  "start.rawApi": "Afficher les exemples API bruts (pour scripts et intégration directe)",
  "start.apiRef": "Référence API",
  "start.apiRefLink.desc": "Documentation API complète avec tous les endpoints, paramètres et exemples.",
  "start.apiDocAgentLink.desc": "Référence API optimisée pour les agents IA — à coller dans le contexte de votre agent.",
  "start.endpoint": "Endpoint",
  "start.method": "Méthode",
  "start.description": "Description",
  "start.auth": "Auth",
  "start.footer": "Huozi — Typographie mobile pour l'ère de l'IA",

  "start.method2.desc": "Installez le skill Huozi depuis ClawHub et publiez du Markdown ou HTML directement depuis OpenClaw.",
  "start.method2.installSkill": "Installer le skill",
  "start.method2.orCli": "Ou via OpenClaw CLI :",
  "start.method2.configure": "Configurer",
  "start.method2.configureDesc": "Définissez votre clé API comme variable d'environnement :",
  "start.method2.usage": "Utilisation",
  "start.method2.usageDesc": "Une fois installé, dites simplement à votre agent :",
  "start.method2.usagePrompt": "Publie ce markdown sur huozi",

  "start.method3.desc": "Ajoutez Huozi comme serveur MCP Claude Code. Publiez du Markdown et HTML directement depuis vos conversations.",
  "start.method3.installMcp": "Installer le serveur MCP",
  "start.method3.configureKey": "Configurer la clé API",
  "start.method3.configureKeyDesc": "Ajoutez votre clé API à l'environnement du serveur MCP :",
  "start.method3.usageThen": "Puis dans Claude Code, dites simplement :",
  "start.method3.usagePrompt": "Publie ce document sur Huozi",

  "start.rawApi.signup": "Inscription",
  "start.rawApi.verify": "Vérification",
  "start.rawApi.setup": "Créer l'espace",
  "start.rawApi.publish": "Publier",

  // Page Connect-Agent
  "connect.back": "← Espace de travail",
  "connect.title": "Connecter un Agent",
  "connect.desc":
    "Trois étapes : choisissez votre agent, collez un extrait, envoyez une requête. Nous détectons le premier appel et confirmons la connexion. Chaque agent a sa propre clé — révocable à tout moment sans affecter les autres.",

  "connect.step1": "1 · Choisissez votre agent",
  "connect.step2": "2 · Collez dans {title}",
  "connect.step3": "3 · Confirmer la connexion",

  "connect.agent.claude-code.tagline": "Terminal, une commande.",
  "connect.agent.claude-code.blurb":
    "Exécutez dans n'importe quel shell. Claude Code enregistre huozi comme serveur MCP distant — disponible dans tous les projets.",
  "connect.agent.cursor.tagline": "À ajouter dans mcp.json.",
  "connect.agent.cursor.blurb":
    "Ajoutez ce bloc à ~/.cursor/mcp.json (ou au .cursor/mcp.json du projet), puis rechargez Cursor.",
  "connect.agent.openclaw.tagline": "Modifier openclaw.json.",
  "connect.agent.openclaw.blurb":
    "Ajoutez ce bloc à ~/.openclaw/openclaw.json sous mcp.servers. Redémarrez OpenClaw pour l'activer.",

  "connect.label.title": "Étiquetez cette clé (affichée dans Connected Agents)",
  "connect.generate": "Générer une clé pour {title}",
  "connect.generating": "Génération…",
  "connect.copy": "Copier",
  "connect.copied": "Copié",
  "connect.generateFirst": "Générez d'abord une clé",

  "connect.rawKey.show": "Afficher la clé API brute",
  "connect.rawKey.note":
    "Le texte en clair n'est jamais stocké — copiez-la maintenant. Les clés perdues peuvent être révoquées et remplacées depuis la page workspace.",

  "connect.waiting.title": "En attente de la connexion de {title}…",
  "connect.waiting.desc":
    "Collez l'extrait ci-dessus, puis envoyez une requête — nous détecterons automatiquement le premier appel.",

  "connect.done.title": "{title} connecté",
  "connect.done.detected": "Premier appel d'outil détecté à",
  "connect.done.note":
    "Vous pouvez fermer cette page — l'agent continuera à utiliser la clé jusqu'à révocation.",
  "connect.done.goto": "Aller à l'espace de travail →",
  "connect.done.another": "Connecter un autre agent",

  "connect.footer.back": "← Retour à l'espace de travail",
  "connect.footer.start": "Laisser l'agent s'installer lui-même (OAuth device flow) →",
  "connect.footer.docs": "Documentation API",

  "connect.terminal.title": "Vous préférez le terminal ? Une commande :",
  "connect.terminal.desc":
    "Fonctionne dans Claude Code, Cursor, OpenClaw — ou n'importe quel agent avec un shell. Exécute le même flux OAuth et écrit la configuration MCP pour vous.",
} as const;
