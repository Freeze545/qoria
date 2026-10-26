# Qoria

IA généraliste grand public — chat, images, fichiers, mémoire, Free/Pro.  
Interface française (Québec), mobile-first.

```bash
cp .env.example .env   # ajoute GROQ_API_KEY
npm install
npm start              # http://localhost:3850
```

Voir [plan.md](./plan.md) pour architecture, coûts et clés.

## Voix (appel vocal)

L'appel vocal utilise la synthèse vocale gratuite du navigateur (Web Speech API). Qoria choisit automatiquement la meilleure voix française disponible (Premium/Enhanced/Neural/Google/Samantha/Thomas/Amélie), parle à un débit de 0.9, découpe le texte en phrases courtes avec de petites pauses et retire emojis/markdown. La qualité dépend de l'appareil : sur iPhone/Mac, télécharger une voix « Améliorée/Premium » (Réglages > Accessibilité > Contenu énoncé > Voix) aide beaucoup. Pour une voix vraiment humaine, il faudrait un TTS payant (ElevenLabs ou OpenAI TTS).

## Images

**Sans clé (toujours on)** : Pollinations classic, modèle `sana`, ~**768×768**, prompts FR→EN + boosters photo. Quota Free 3/jour **non** consommé si échec. Qualité honnête : correcte, **pas** DALL·E 3.

**Pour excellence** (recommandé) :
| Clé | Effet | Coût approx. |
|-----|--------|--------------|
| `POLLINATIONS_API_KEY` (enter.pollinations.ai) | Flux schnell / modèles gen, moins de rate-limit | Flux souvent 0 Pollen ; autres modèles ≈ $ |
| `IMAGE_API_KEY` (DALL·E 3) | Haute qualité HD | ~0,04–0,08 $/image |
| `XAI_API_KEY` | Grok Image | selon xAI |

## Vidéo

**Aucun chemin gratuit excellent** (Pollinations video, fal, Runway, Luma, Sora = tous payants / clé requise).  
Sans clé : message FR honnête + Free **1/jour** vs Pro **plafond hebdo généreux** une fois branché.

| `VIDEO_PROVIDER` | Clé | Coût approx. / clip 5s |
|------------------|-----|-------------------------|
| `fal` | `FAL_KEY` | ~0,05–0,10 $ (Wan turbo) |
| `pollinations` | `POLLINATIONS_API_KEY` + Pollen | ~0,05 $ (Wan 2.2 fast) |
| `runway` | `RUNWAYML_API_SECRET` | ~0,25–0,50 $ |
| `luma` | `LUMA_API_KEY` | ~0,20–1 $ |
| `openai` | `OPENAI_OWN_API_KEY` (Sora) | crédits OpenAI |
| `generic` | `VIDEO_API_KEY` + `VIDEO_API_URL` | selon ton backend |

E2E réel dès qu’une clé est présente : génération → fichier `/uploads/…` → lecteur vidéo dans le chat.

## Chat

Modèle Groq par défaut : `openai/gpt-oss-120b`. Prompt système Qoria : québécois, direct, peu de fluff. Température ~0.55, max tokens 1200.

## Free vs Pro (limites)

| | Free | Pro |
|--|------|-----|
| Chat | Illimité | Plafond hebdo soft (`PRO_WEEKLY_MESSAGES`, défaut 2500) |
| Images | 3 / jour | Soft hebdo (`PRO_WEEKLY_IMAGES`, défaut 150) |
| Vidéo | 1 / jour* | Soft hebdo (`PRO_WEEKLY_VIDEOS`, défaut 30) |
| Ensemble | — | Soft hebdo (`PRO_WEEKLY_ENSEMBLE`, défaut 40) |

Semaine calendaire **lundi → dimanche** (America/Toronto). Au plafond : « Limite hebdo Pro atteinte — revient lundi ».
Usage Pro normal ne touche presque jamais le plafond — c’est un filet de sécurité coûts, pas un quota Free déguisé.

## PWA

`manifest.webmanifest` + `apple-touch-icon` + service worker shell (`sw.js`, assets statiques seulement — **jamais** `/api/*`). Sur iPhone : Safari → Partager → Sur l’écran d’accueil.
