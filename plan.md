# Qoria — plan produit & architecture

**Marque :** Qoria (IA généraliste grand public, UI française Québec, mobile-first iPhone)  
**Pas DevisNord, pas Micheal commercial.**  
**Repo :** Freeze545/qoria · hébergement Render (free → starter)

## Vision

Produit public type ChatGPT/Grok/Gemini : chat, raisonnement, écriture, code, images, fichiers/vision, voix navigateur, recherche web optionnelle, mémoire utilisateur, comptes Free/Pro.

**Honnêteté :** Qoria n’entraîne pas de fondation model. Elle **orchestre** des APIs cloud (Groq, OpenAI, xAI, Anthropic, Gemini) derrière une seule marque. L’utilisateur ne s’inscrit pas chez chaque fournisseur.

## Architecture

```
iPhone (Safari/Chrome)
  → HTTPS Render Web Service (Node/Express)
    → Auth JWT cookie + bcrypt
    → DB JSON fichier (data/qoria.json) — évolutif vers Postgres + disk
    → Model Router (lib/router.js)
        → adapters (lib/providers.js): Groq / OpenAI / xAI / Anthropic / Gemini
    → Images: IMAGE_API_KEY / POLLINATIONS_API_KEY (Flux) OU classic Pollinations (~768²)
    → Vidéo: FAL_KEY / Pollinations Pollen / Runway / Luma / Sora (aucun chemin gratuit excellent)
    → Fichiers: multer + vision multimodal / pdf-parse / txt
    → Mémoire: liste user → injectée dans system prompt
    → Limites Free/Pro + ensemble cap
    → Stripe Checkout (stub sans PRICE_ID)
```

### Routeur de modèles

| Tâche | Préférence (1er connecté gagne) |
|-------|----------------------------------|
| default / fast | Groq → OpenAI → Gemini → xAI → Anthropic |
| code | Anthropic → OpenAI → Groq → … |
| reason / ensemble | Anthropic → OpenAI → xAI → Groq → … |
| write | Anthropic → OpenAI → xAI → Gemini → Groq |
| vision | OpenAI → Gemini → Anthropic → xAI → Groq |
| image_gen | Paid DALL·E/xAI si clé, sinon **Pollinations** |

Un fournisseur n’est marqué **connecté** que si la clé env est présente **et** un smoke test HTTP a réussi au démarrage / via `/api/providers/smoke`. Sinon : « clé manquante » + repli Groq/Pollinations.

**Ensemble (Pro) :** 2 modèles + présentation comparée. Plafond hebdo `PRO_WEEKLY_ENSEMBLE` (défaut 40/semaine) pour que le coût API reste sous le revenu abo.

### Routage cheap-first (coûts)

1. **Chat normal** (salut, Q&A court, résumé, écriture légère, petit code) → **Groq uniquement**.
2. **Escalade payante** (OpenAI / Claude / Gemini / xAI) seulement si complexité réelle :
   - raisonnement dur (preuve, stratégie multi-étapes, analyse longue)
   - gros code / architecture / multi-fichiers
   - vision (pièce jointe image)
   - mode **ensemble** (Pro)
3. Si la clé premium manque → repli Groq, pas d’échec silencieux.
4. L’utilisateur ne voit jamais l’inscription fournisseur — marque Qoria seule.


## Coûts (ordres de grandeur CAD, 2026)

| Poste | Free tier | Notes |
|-------|-----------|-------|
| Render Web | 0 $ | Cold start ; disk éphémère |
| Groq | généreux free / pay-as-you-go | Défaut actuel `qwen/qwen3.8-27b` |
| Pollinations images (classic) | 0 $ | ≈768² sana — ok, pas DALL·E |
| Pollinations gen (clé) | Pollen / $ | Flux schnell etc. — excellence |
| Vidéo (fal Wan / Pollinations / Runway / Luma / Sora) | ~0,05–0,50 $/clip | Clé requise; Free 1/jour vs Pro plafond hebdo |
| OpenAI GPT-4o | ~$/1M tokens | Qualité vision/écriture |
| xAI Grok | selon plan | |
| Anthropic Claude | selon plan | Excellent code/raisonnement |
| Gemini | free tier + payant | Bon vision |
| Tavily search | free limited | Optionnel |
| Stripe | 0 jusqu’à vrais paiements | Test key ≠ charge réelle |

**Contrôle coûts :** Free = chat illimité + 3 images/jour + 1 vidéo/jour.
**Pro = plafond hebdo soft** (semaine calendaire lundi→dimanche, fuseau America/Toronto) — ressenti généreux vs Free, mais plafond backend pour rester rentable :
- `PRO_WEEKLY_MESSAGES` défaut **2500**
- `PRO_WEEKLY_IMAGES` défaut **150**
- `PRO_WEEKLY_VIDEOS` défaut **30**
- `PRO_WEEKLY_ENSEMBLE` défaut **40**
Message FR au plafond : « Limite hebdo Pro atteinte — revient lundi ». Pas d’agents multi-step illimités en v1.

**Règle business :** ne pas ouvrir ensemble / modèles premium sans marge (clés payantes + Pro).

## Acquisition (esquisse)

1. Landing FR claire + partage X/TikTok « IA québécoise »
2. Free généreux mais plafonné → friction douce vers Pro 20 $/mois CAD
3. SEO pages cas d’usage (études, code, écriture)
4. Pas de dark patterns ; transparence « multi-modèles »

## Clés à fournir (Lucas)

| Variable | Obligatoire ? | Rôle |
|----------|---------------|------|
| `GROQ_API_KEY` ou `OPENAI_API_KEY` + base Groq | **Oui (MVP)** | Chat défaut |
| `JWT_SECRET` | Oui prod | Sessions |
| `OPENAI_OWN_API_KEY` | Non | OpenAI officiel |
| `XAI_API_KEY` | Non | Grok |
| `ANTHROPIC_API_KEY` | Non | Claude |
| `GEMINI_API_KEY` | Non | Gemini |
| `IMAGE_API_KEY` + `IMAGE_BASE_URL` | Non | Images payantes |
| `TAVILY_API_KEY` | Non | Recherche web |
| `VIDEO_API_KEY` + `VIDEO_API_URL` | Non | Vidéo (stub sinon) |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` | Pour vrais paiements | Checkout Pro ~20 $/mois CAD |

## Limites honnêtes (ne pas fake)

- Pas de fondation model maison
- Vidéo = stub sans `VIDEO_*`
- Web search seulement si `TAVILY_API_KEY`
- Agents multi-outils : v1 = image + mémoire + search optionnel ; expansion plus tard
- Disk Render free = données perdues au redeploy → prévoir **Persistent Disk** ou Postgres
- Voix = Web Speech ; Safari iOS souvent limité
- Ensemble = fusion présentationnelle (pas un juge ML entraîné)

## Prochaines étapes

1. Persistent Disk + Postgres
2. Streaming SSE
3. Webhooks Stripe → plan Pro auto
4. Domaine custom qoria.*
5. PWA (manifest + icônes + SW shell) — fait ; App Store wrapper plus tard
6. Clés payantes images/vidéo premium + Stripe live
