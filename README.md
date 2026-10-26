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

Par défaut : **Pollinations gratuit** (prompts enrichis FR→EN + boosters photo/éclairage, modèle `flux` si dispo, 1024²).  
Le quota Free (3/jour) n’est **pas** consommé si la génération échoue.

- Avec `IMAGE_API_KEY` (DALL·E 3 / compatible) ou `POLLINATIONS_API_KEY` : clairement meilleure qualité.
- Sans clé payante : mieux qu’avant, mais le plafond gratuit reste **en-dessous** de DALL·E 3 / Flux payant (détails, texte dans l’image, cohérence).

## Chat

Modèle Groq par défaut : `openai/gpt-oss-120b` (plus fort que le petit Qwen). Prompt système Qoria : québécois, direct, peu de fluff. Température ~0.55, max tokens 1200.
