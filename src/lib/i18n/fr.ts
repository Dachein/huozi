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

  // /cloud — page complète
  "cloud.meta.title": "huozi Cloud — Un disque dur natif pour les agents",
  "cloud.meta.description":
    "Un workspace cloud pour agents. Parle le dialecte d'outils-fichier de Claude Code. Apportez votre agent — Claude Code, Cursor, Codex, ou le vôtre — et montez-le où vous voulez.",

  "cloud.status.shipping": "Disponible",
  "cloud.status.coming": "Bientôt",
  "cloud.status.preview": "Aperçu",

  "cloud.metaphor.title": "Le disque dur externe, pour les agents",
  "cloud.metaphor.body1":
    "Une clé USB fonctionne partout parce qu'elle parle une seule interface standard. Branchez-la, n'importe quel ordinateur la lit. N'importe quel OS, n'importe quelle époque.",
  "cloud.metaphor.body2":
    "Nous voulions la même chose pour les agents. huozi Cloud est un workspace cloud montable qui parle exactement le dialecte d'outils-fichier que Claude Code utilise aujourd'hui — ce qui signifie que tout agent déjà entraîné sur ce dialecte (Claude Code lui-même, Cursor, Codex, agents personnalisés) peut y travailler sans aucune modification.",

  "cloud.compare.physical": "Disque dur physique",
  "cloud.compare.huozi": "huozi Cloud",
  "cloud.compare.r1a": "Protocole USB / SATA",
  "cloud.compare.r1b": "MCP + dialecte d'outils Claude Code",
  "cloud.compare.r2a": "Lettre / point de montage",
  "cloud.compare.r2b": "URI du workspace",
  "cloud.compare.r3a": "Permissions de répertoires",
  "cloud.compare.r3b": "Scope (préfixe par clé API)",
  "cloud.compare.r4a": "Journal du système de fichiers",
  "cloud.compare.r4b": "Journal de commits Git",
  "cloud.compare.r5a": "Monté sur n'importe quelle machine",
  "cloud.compare.r5b": "Accédé par n'importe quel agent",

  "cloud.shipped.title": "Ce qui vit aujourd'hui",
  "cloud.shipped.intro1": "Sept outils MCP, exposés sur ",
  "cloud.shipped.intro2":
    ". Cinq sont des miroirs bit-exact de Claude Code ; deux sont des extensions cloud-natives.",
  "cloud.tools.ccMirror": "Miroir CC",
  "cloud.tools.extension": "Extension huozi",
  "cloud.tools.read.desc":
    "Lecture paginée par lignes, sortie cat -n, cache file_unchanged, retour binaire en base64 ou URL signée.",
  "cloud.tools.edit.desc":
    "Remplacement de chaîne exact. Read-before-Edit imposé. Détection de péremption via blob_sha. Sortie structuredPatch.",
  "cloud.tools.write.desc":
    "Création ou écrasement. LF imposé. Distinction create/update dans le résultat.",
  "cloud.tools.glob.desc":
    "Correspondance par motif glob. Tri mtime décroissant. Tronqué à 100 fichiers.",
  "cloud.tools.grep.desc":
    "Recherche regex. Modes content / files_with_matches / count. Contexte -A/-B/-C. Filtre type.",
  "cloud.tools.batch.desc":
    "Édition atomique de N fichiers. all_or_nothing + commit_sha unique. Résultats par fichier.",
  "cloud.tools.history.desc":
    "Interroge l'historique de commits d'un fichier. Classification d'opération (create / edit / write / batch). Pagination.",

  "cloud.underHood.title": "Sous le capot",
  "cloud.underHood.b1.label": "Cloudflare Workers",
  "cloud.underHood.b1.desc":
    " comme endpoint MCP serverless (JSON-RPC 2.0 sur HTTP).",
  "cloud.underHood.b2.label": "R2",
  "cloud.underHood.b2.desc":
    " stocke les blobs adressés par SHA-1 compatible Git (même algorithme que le vrai blob <size>\\0<content> de Git).",
  "cloud.underHood.b3.label": "D1",
  "cloud.underHood.b3.desc":
    " maintient l'index files_current, la chaîne de commits, les lignes d'audit par chemin et les clés API.",
  "cloud.underHood.b4.label": "Durable Objects",
  "cloud.underHood.b4.desc":
    " sérialisent la section critique côté écriture (un DO par workspace) et persistent le ReadFileState par session entre requêtes (un DO par {workspace, principal}).",
  "cloud.underHood.b5.label": "Auth Bearer",
  "cloud.underHood.b5.desc":
    " : un token est haché vers une ligne api_keys ; cette ligne lie l'appel à un workspace, un principal et un préfixe scope optionnel.",

  "cloud.principles.title": "Principes de design",
  "cloud.principles.1.title": "Bit-exact avec le dialecte CC",
  "cloud.principles.1.body":
    "Tout agent entraîné sur la surface d'outils Claude Code doit fonctionner ici sans changement de code. Noms de champs, valeurs par défaut, codes d'erreur, et même chaînes d'erreur structurelles sont préservés. Toute déviation par rapport à CC est documentée.",
  "cloud.principles.2.title": "Git est la vérité ; tout le reste est cache",
  "cloud.principles.2.body":
    "Le journal de commits est la source de vérité. Index D1, état des Durable Objects, caches in-Worker — tous reconstructibles depuis l'historique Git. Récupération, debug et sauvegarde simplifiés.",
  "cloud.principles.3.title": "Workspace = point de montage",
  "cloud.principles.3.body":
    "Pas d'espace de noms global partagé. Un workspace est une boîte fermée avec sa propre ACL, son propre historique, sa propre frontière de sauvegarde. Les utilisateurs créent des workspaces ; les agents vivent dans un.",
  "cloud.principles.4.title": "Revert seulement, pour toujours",
  "cloud.principles.4.body":
    "Pas de force-push. Pas de réécriture d'historique. Pas d'override admin. Chaque « annulation » crée un nouveau commit qui annule l'ancien. La trace d'audit est immuable. Non négociable pour les usages conformité.",
  "cloud.principles.5.title": "Lots tout-ou-rien",
  "cloud.principles.5.body":
    "Écrire 10 fichiers comme un seul changement logique doit produire un seul commit. huozi_batch_edit valide la péremption sur tout le lot avant d'écrire — un échec partiel annule tout.",
  "cloud.principles.6.title": "Correspondance stricte, pas de fallback espaces",
  "cloud.principles.6.body":
    "L'outil Edit de Claude Code échoue durement quand old_string ne correspond pas exactement. Le serveur MCP filesystem officiel, à l'inverse, retombe silencieusement sur une correspondance tolérante aux espaces — et édite la mauvaise position en cas d'écritures concurrentes. Nous suivons CC : échec strict, relecture explicite.",

  "cloud.roadmap.title": "Feuille de route",
  "cloud.roadmap.1.label": "Cloisonnement scope",
  "cloud.roadmap.1.desc":
    "Sandbox de sous-répertoire lié à la clé API. Un agent scope sur funds/fund-A/ ne peut physiquement pas lire funds/fund-B/.",
  "cloud.roadmap.2.label": "Scanner de secrets",
  "cloud.roadmap.2.desc":
    "Scan inline à l'écriture. ~20 règles intégrées (AWS / OpenAI / GitHub / JWT / clés privées) + liste blanche de placeholders.",
  "cloud.roadmap.3.label": "Grep niveau production",
  "cloud.roadmap.3.desc":
    "Index trigramme D1 FTS5 pour regex rapides ; fallback stream-scan pour patterns multi-lignes / complexes ; plafonds de sécurité 5 Mo / 50 Mo / 10 s.",
  "cloud.roadmap.4.label": "Vrais hash de commits Git",
  "cloud.roadmap.4.desc":
    "isomorphic-git sur Cloudflare Worker. SHA de commit identique à ce que produirait Git local.",
  "cloud.roadmap.5.label": "Édition de notebooks",
  "cloud.roadmap.5.desc":
    "Outil huozi_notebook_edit pour les cellules .ipynb. D'ici là, notebooks en lecture seule.",
  "cloud.roadmap.6.label": "Outil revert",
  "cloud.roadmap.6.desc":
    "huozi_revert par commit_sha ou message_uuid. Nouveau commit annule l'ancien ; historique préservé.",
  "cloud.roadmap.7.label": "Recherche multi-workspace",
  "cloud.roadmap.7.desc":
    "Concept d'organisation au-dessus des workspaces. Permet à un gérant de fonds de chercher dans tous ses fonds d'un coup.",
  "cloud.roadmap.8.label": "Abonnés en temps réel",
  "cloud.roadmap.8.desc":
    "Push WebSocket depuis le WorkspaceDO. Quand l'agent A commit, l'agent B reçoit une notification de fichiers modifiés en temps réel.",

  "cloud.try.title": "Essayer",
  "cloud.try.intro":
    "Bêta privée. Contactez-nous pour un token Bearer lié à votre workspace. Une fois en main, choisissez votre agent :",
  "cloud.try.h.claudeCode": "Claude Code",
  "cloud.try.h.claudeDesktop": "Claude Desktop",
  "cloud.try.h.rawHttp": "HTTP brut",

  "cloud.who.title": "Pour qui",
  "cloud.who.1.title": "Agents qui font du vrai travail",
  "cloud.who.1.body":
    "Tout ce que vous confieriez à Read/Edit/Write sur votre laptop — agents de recherche, agents de code, rédacteurs de rapports — peut désormais le faire entre machines, entre sessions, chaque modification auditée.",
  "cloud.who.2.title": "Équipes pilotant plusieurs agents",
  "cloud.who.2.body":
    "Un workspace, plusieurs agents, plusieurs humains. Le modèle de péremption garde les écrivains concurrents honnêtes. Le journal de commits montre qui a fait quoi.",
  "cloud.who.3.title": "Workflows sensibles à la conformité",
  "cloud.who.3.body":
    "Recherche financière, mémos juridiques, documentation réglementée. Historique immuable, audit par fichier, scope sous-répertoire optionnel pour accès analyste.",
  "cloud.who.4.title": "Travail multi-appareils",
  "cloud.who.4.body":
    "Démarrez sur le laptop. Continuez sur l'iPad. Relisez sur le téléphone. L'état de votre agent — ce qu'il a lu, ce qu'il a édité — vous suit.",

  "cloud.footer.tagline": "Un workspace pour agents. Bâti sur Cloudflare.",
  "cloud.footer.publish": "Publier (MD/HTML)",

  // /edge — page complète
  "edge.meta.title": "huozi Edge — Auto-hébergez le disque pour agents",
  "edge.meta.description":
    "Édition open-source mono-déployeur de huozi. Déploiement en un clic sur Cloudflare ou Vercel. Pas de Supabase, pas de comptes, licence MIT.",

  "edge.badge.openSource": "Open Source · MIT",
  "edge.hero.tagline1": "Le même disque pour agents, sur votre propre infra.",
  "edge.hero.tagline2":
    "Pas de Supabase. Pas de connexion e-mail. Un déployeur, un workspace, un domaine à vous.",
  "edge.cta.deployCF": "Déployer sur Cloudflare",
  "edge.cta.deployVercel": "Déployer sur Vercel",
  "edge.cta.github": "Voir sur GitHub",

  "edge.same.title": "Le même disque, à vous de le faire tourner",
  "edge.same.body1":
    "Edge livre exactement la même surface MCP, la même compatibilité Claude Code, la sync live, l'historique de commits et les URL de partage publiques que Cloud — sans le système de comptes hébergé. Vous détenez HUOZI_ADMIN_SECRET, vous déployez sur votre propre Cloudflare ou Vercel, et toute personne à qui vous remettez une clé API collée peut connecter un agent.",
  "edge.same.body2":
    "Comme les deux éditions sont une seule base de code gardée par HUOZI_EDITION, chaque correction de bug et chaque fonctionnalité atterrit dans les deux en même temps.",

  "edge.compare.title": "Cloud vs Edge",
  "edge.compare.col.cloud": "Cloud",
  "edge.compare.col.edge": "Edge",
  "edge.compare.r1.label": "Qui l'opère",
  "edge.compare.r1.cloud": "huozi.app",
  "edge.compare.r1.edge": "Vous",
  "edge.compare.r2.label": "Authentification",
  "edge.compare.r2.cloud": "OTP par e-mail (Supabase)",
  "edge.compare.r2.edge": "Secret admin + collage de clé",
  "edge.compare.r3.label": "Utilisateurs par instance",
  "edge.compare.r3.cloud": "Plusieurs",
  "edge.compare.r3.edge": "Un déployeur",
  "edge.compare.r4.label": "Workspaces par utilisateur",
  "edge.compare.r4.cloud": "Un (extensible)",
  "edge.compare.r4.edge": "Un workspace fixe",
  "edge.compare.r5.label": "Coût",
  "edge.compare.r5.cloud": "Payer huozi.app",
  "edge.compare.r5.edge": "Payer Cloudflare / Vercel (souvent 0 $)",
  "edge.compare.r6.label": "Licence",
  "edge.compare.r6.cloud": "Service propriétaire",
  "edge.compare.r6.edge": "MIT",

  "edge.bootstrap.title": "Démarrer en 3 étapes",
  "edge.bootstrap.s1.title": "Déployer + définir les secrets",
  "edge.bootstrap.s1.body":
    "Déploiement en un clic, puis définissez un fort HUOZI_ADMIN_SECRET et HUOZI_EDITION=edge.",
  "edge.bootstrap.s2.title": "Émettre la clé admin",
  "edge.bootstrap.s2.body":
    "Appelez l'endpoint admin du worker une fois pour émettre votre première clé API. Vous la collerez dans l'UI web à l'étape 3.",
  "edge.bootstrap.s3.title": "Coller la clé, commencer à écrire",
  "edge.bootstrap.s3.body":
    "Allez sur https://<votre-domaine>/connect, collez la clé hz_… retournée, et c'est bon. Connectez Claude Code / Cursor / Desktop depuis la page Keys, comme sur Cloud.",

  "edge.footer.repo": "Dépôt GitHub",
  "edge.footer.docs": "Référence MCP",
  "edge.footer.compare": "Comparer avec Cloud",

  // Pied de page marketing — groupes
  "footer.tagline": "Un disque cloud natif pour les agents.",
  "footer.col.product": "Produit",
  "footer.col.resources": "Ressources",
  "footer.col.source": "Source",
  "footer.legal": "Licence MIT · Bâti sur Cloudflare",
  "nav.language": "Langue",

  // Workspace · panneau Récent
  "recent.title": "Récent",
  "recent.op.new": "nouveau",
  "recent.op.edited": "modifié",
  "recent.op.deleted": "supprimé",

  // Workspace · titre latéral (lien cliquable vers l'accueil)
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "Gérer · Rechercher",
  "ws.stats.files": "Fichiers",
  "ws.stats.recent": "Modifs récentes",
  "ws.stats.agents": "Agents",
  "ws.search.title": "Rechercher dans le workspace",
  "ws.search.placeholder": "Tapez un nom de fichier ou chemin…",
  "ws.search.noMatch": "Aucun fichier ne correspond.",

  // Dialogue de partage — expiration
  "share.expiry.label": "Le lien expire dans",
  "share.expiry.hint": "Les liens expirés renvoient introuvable. Choisissez « Jamais » pour un lien permanent.",
  "share.expiry.30m": "30 min",
  "share.expiry.6h": "6 heures",
  "share.expiry.24h": "24 heures",
  "share.expiry.1mo": "1 mois",
  "share.expiry.never": "Jamais",
  "share.expiry.expiresAt": "Expire {when}",
  "share.expiry.permanent": "Sans expiration",

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

  // /start — guide d'installation
  "start.meta.title": "Commencer — huozi Cloud",
  "start.meta.description":
    "Une commande ou une invite. Donnez-la à n'importe quel Agent. Un clic de lien. Terminé.",
  "start.hero.title": "Commencer",
  "start.hero.subtitle":
    "Une invite, un clic, terminé. Fonctionne avec n'importe quel Agent compatible MCP.",

  "start.conversation.title": "Confiez à votre Agent",
  "start.conversation.badge": "chat · ~60 secondes",
  "start.conversation.desc":
    "Collez ceci dans n'importe quel Agent compatible MCP (Claude Code, Cursor, OpenClaw, ou tout autre ayant un accès web). Il lit le protocole d'installation depuis cette page, puis vous pose 2–3 questions dans le chat : inscription, connexion navigateur, ou collage d'un token existant. Aucun terminal requis.",

  "start.terminal.title": "Ou, depuis un terminal",
  "start.terminal.badge": "Node ≥ 18",
  "start.terminal.desc":
    "Alternative pour développeurs. Exécute le même flux OAuth de manière interactive et écrit la configuration MCP. Pour humains au shell — le CLI refuse les entrées non-TTY, donc les Agents doivent piloter directement la machine d'états HTTP.",

  "start.prompt.title": "1 · Ou, collez cette invite dans votre Agent",
  "start.prompt.badge": "Lisible par l'Agent",
  "start.prompt.desc":
    "Fonctionne dans Claude Code, Cursor, OpenClaw, ou tout Agent capable d'appels HTTP. L'Agent lit les étapes et les exécute ; votre seul rôle est de cliquer une fois sur Authorize dans le navigateur.",
  "start.prompt.langNote":
    "(Conservé en anglais — tous les LLM le lisent nativement.)",

  "start.authorize.title": "2 · L'Agent imprime un lien — cliquez sur Authorize",
  "start.authorize.example":
    "→ Ouvrez https://huozi.app/device?code=ABCD-1234 et cliquez sur Authorize.",
  "start.authorize.desc":
    "Ouvrez le lien dans n'importe quel navigateur. Si vous n'êtes pas connecté à huozi.app, faites d'abord un email OTP unique. Vous verrez ensuite quel Agent demande l'accès, à quel workspace, et un bouton Authorize. Cliquez, puis fermez l'onglet.",

  "start.done.title": "3 · L'Agent se connecte automatiquement · terminé",
  "start.done.descBefore":
    "En quelques secondes, l'Agent récupère la clé, enregistre le serveur MCP, et annonce",
  "start.done.connectedPhrase": "✓ Connecté au workspace …",
  "start.done.descAfter":
    ". Désormais chaque requête de l'Agent peut lire et écrire dans votre workspace huozi.",
  "start.done.manageBefore":
    "Gérez les connexions, parcourez les fichiers, révoquez à tout moment depuis",
  "start.done.manageAfter": ".",

  "start.manual.summary": "Pas d'Agent ? À la main",
  "start.manual.desc":
    "Le même flux est du HTTP brut — vous pouvez exécuter les commandes curl vous-même :",
  "start.manual.noteBefore":
    "Déjà connecté à huozi.app ? Vous pouvez aussi obtenir un extrait de configuration prêt à coller pour Cursor / OpenClaw directement à :",
  "start.manual.noteAfter": ".",

  "start.footer.mcp.title": "Référence MCP",
  "start.footer.mcp.desc":
    "Tous les outils huozi_*, le format JSON-RPC, les événements temps réel.",
  "start.footer.cloud.title": "À propos de Cloud",
  "start.footer.cloud.desc":
    "Pourquoi les Agents ont besoin d'un drive partagé avec historique de commits.",
  "start.footer.edge.title": "Auto-hébergé (Edge)",
  "start.footer.edge.desc":
    "Le même drive, déployé sur votre propre Cloudflare / Vercel. MIT.",

  // InstallPicker sur /start
  "start.picker.title": "Installation selon votre agent",
  "start.picker.subtitle":
    "Choisissez votre client — nous afficherons exactement ce qui s'applique. MCP apporte les outils ; Skill / Rules apporte le savoir-faire. La plupart des clients veulent les deux.",
  "start.picker.generic.name": "Générique / Autre",

  "start.picker.content.claude-code.mcp.body":
    "La voie canonique d'extension de Claude Code est MCP — les descriptions d'outils portent tout le contexte dont l'Agent a besoin. Exécutez ceci dans n'importe quel terminal ; le CLI ouvre votre navigateur pour une autorisation en un clic, écrit la configuration MCP utilisateur de Claude Code, et tout nouveau shell la prend en compte.",

  "start.picker.content.cursor.mcp.body":
    "Cursor prend en charge nativement MCP distant. Ouvrez le terminal intégré de Cursor (⌘J) et exécutez ceci — il écrit ~/.cursor/mcp.json ; Reload Window (⌘⇧P) pour l'activer.",

  "start.picker.content.openclaw.mcp.body":
    "Exécutez ceci et la couche MCP d'OpenClaw est configurée. Le CLI écrit ~/.openclaw/openclaw.json sous mcp.servers.huozi (transport : streamable-http) ; redémarrez OpenClaw.",
  "start.picker.content.openclaw.skill.body":
    "L'écosystème natif d'OpenClaw est ClawHub — Skill y est un citoyen de première classe. Exécutez ceci : le CLI récupère huozi/mcp depuis ClawHub dans ~/.openclaw/skills/ ; redémarrez OpenClaw pour l'activer.",
  "start.picker.content.openclaw.skill.note":
    "Skill n'apparaît que pour OpenClaw parce que c'est là qu'il est l'idiome natif — les utilisateurs Claude Code et Cursor en restent à MCP.",

  "start.picker.content.generic.mcp.body":
    "Tout Agent capable d'appels HTTP. Collez cette invite dans l'Agent — il lit les étapes, exécute le flux device en curl, et écrit sa propre configuration MCP. Votre seul rôle : cliquer une fois sur Authorize dans le navigateur.",
  "start.picker.content.generic.mcp.note":
    "Conservé en anglais — les LLM lisent l'anglais nativement et traduire les étapes risque des dérives subtiles. Fonctionne pour tout client MCP stdio / HTTP.",

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

  // CSV · détails de la ligne
  "csv.rowDetail.title": "Détails de la ligne",
  "csv.rowDetail.open": "Ouvrir les détails de la ligne",
  "csv.rowDetail.close": "Fermer",
  "csv.rowDetail.rowOf": "Ligne {n} sur {total}",
  "csv.rowDetail.empty": "—",
} as const;
