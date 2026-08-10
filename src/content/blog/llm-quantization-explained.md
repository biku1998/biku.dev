---
title: "What Does q4_K_M Even Mean? A Practitioner's Guide to LLM Quantization."
description: "You don't need to be a researcher to make smart choices when downloading models. Here's what quantization actually is, why it barely hurts quality, and how to pick the right version on Ollama or Hugging Face."
pubDate: 2026-06-20
tags: ["ai", "engineering", "llm"]
draft: false
image: "/blog-posters/Six.png"
---

You want to run a model locally. You open Ollama, search for Llama, and you're hit with a wall of cryptic names:

```text
llama3:8b-instruct-q4_K_M
llama3:8b-instruct-q8_0
llama3:70b-instruct-q4_K_M
```

What's the difference? Which one should you pull? Is the `q4` one going to be dumb? Is bigger always better? You just want a model that runs on your laptop and gives good answers.

That cryptic suffix, `q4_K_M`, is **quantization**. I've been running and serving these models for a while now, and once the foundation clicks, every one of those names becomes readable and every download decision becomes obvious. Let me take you there. No math degree required.

## What quantization actually is

Every LLM is, at its core, a giant pile of numbers called **weights**, billions of them. When you send a prompt, those numbers multiply together to produce your answer. Quantization answers one simple question: *how precisely do we need to store each of those numbers?*

Think about describing someone's height:

- "He's exactly 5 feet, 11.4823 inches" is very precise
- "He's about 6 feet" is less precise
- "He's tall" is barely precise

For almost every real conversation, "about 6 feet" is fine. Quantization is the craft of figuring out how much precision you can throw away before the answers actually start getting worse.

Computers store those numbers using bits. A weight in full precision (FP32) uses 32 bits each. Half precision (FP16) uses 16. Quantization pushes that down to 8 bits (INT8) or even 4 bits (INT4), the `q8` and `q4` you saw in those Ollama names. Fewer bits per weight means a smaller model.

## Why throwing away precision barely hurts

This is the part that feels like magic until you see why. How can a model lose half (or three-quarters) of its numeric precision and still answer just as well?

The answer: a trained model's weights are *well-behaved*. After training, they cluster tightly around zero in a bell curve, with very few extreme values and lots of small ones near the middle. So most of the precision you're paying for in FP32 is being spent distinguishing between numbers the model treats as basically identical. You're storing "34.7821 grams of flour" when the recipe only ever needed "a handful."

Quantization rounds each weight to the nearest allowed step and stores a small **scale factor** so the runtime can reconstruct an approximate value when it does the math. It's the same trick a CD pulls on a vinyl record: chop a smooth signal into discrete steps fine enough that your ear can't tell. The model can't tell either.

## The memory math (this is the whole point)

Here's why anyone bothers. Each FP32 weight is 4 bytes, so a 7-billion-parameter model needs 28 GB just for its weights, more than most consumer GPUs hold. Quantize it and watch what happens:

| Format | Bits/weight | 7B model | 70B model |
| ------ | ----------- | -------- | --------- |
| FP32 | 32 | 28 GB | 280 GB |
| FP16 | 16 | 14 GB | 140 GB |
| INT8 (`q8`) | 8 | 7 GB | 70 GB |
| INT4 (`q4`) | 4 | 3.5 GB | 35 GB |

A 70B model in full FP16 needs ~140 GB of VRAM, roughly $20,000 of datacenter GPU. Quantize it to 4-bit and it drops to ~35–40 GB, which fits on a single high-end consumer card. That's the difference between "I can't run this" and "this runs on the machine under my desk." For local inference, quantization isn't an optimization. It's the thing that makes it possible at all.

## Decoding the names you'll actually see

Back to `llama3:8b-instruct-q4_K_M`. Now you can read it:

- **`8b`** is 8 billion parameters (the model's size).
- **`q4`** means quantized to 4 bits per weight.
- **`K`** means "K-quant," or *mixed* precision. Instead of crushing every layer to 4 bits, the important layers (like attention) keep more bits and the less important ones get squeezed harder. This smart allocation is why a good 4-bit model holds up far better than naive 4-bit.
- **`M`** is the size variant: **S**mall, **M**edium, or **L**arge, trading a bit more file size for a bit more quality.

So `q4_K_M` is the sweet-spot default most people recommend: 4-bit, mixed precision, medium variant. `q8_0` is 8-bit (higher quality, double the size). A plain `q4_0` is older-style uniform 4-bit, generally skip it in favor of the `_K_` versions.

You'll also run into format names outside Ollama. Your real question isn't "what is AWQ" but "which one do I download?" So here's the decision, not the dictionary:

- **GGUF:** *Running locally on Ollama or llama.cpp? It's always this. Ignore the rest.* One self-contained file that runs on CPU or splits across CPU and GPU, and where those `q4_K_M`-style tags come from.
- **AWQ:** *Serving on GPUs via vLLM or TGI and quality matters? Make this your default.* It protects the most important weights so 4-bit rounding doesn't damage the output.
- **GPTQ:** *Also for GPU serving; reach for it when AWQ isn't published for the model you want.* It uses calibration data to round each layer so its output stays close to the original.
- **NF4:** *Only relevant if you're fine-tuning, not just running.* It's the 4-bit format QLoRA uses to train big models on consumer hardware.

The short version: local means GGUF, GPU serving means AWQ (then GPTQ as fallback), fine-tuning means NF4. For most people reading this, it's GGUF and you never think about the others.

## How much quality do you really lose?

Less than you'd fear. Real benchmarks land roughly here:

- **FP16 to INT8:** often a sub-1% change. Effectively free.
- **INT8 to INT4:** a noticeable but usually small step. Think a few percent on perplexity, often near-invisible in everyday chat with good `_K_` quants.

And here's the rule of thumb that should drive your downloads:

> **A bigger model at lower precision almost always beats a smaller model at higher precision, at the same file size.**

A 70B model at `q4` will run circles around an 8B model at `q8`, even though they take up similar disk space. So the move is: pick the *largest* model your hardware can hold, then choose the quantization that makes it fit, not the other way around.

## And yes, it's faster too

Smaller weights don't just save space, they move through the system faster. On the same hardware, a 4-bit model usually loads quicker and generates tokens roughly 1.5–2x faster than its FP16 equivalent.

The reason is worth knowing, because it's a common misconception: quantization doesn't reduce the *number* of calculations (the math operations are unchanged), it reduces how much *data* has to move. Since memory bandwidth, not raw compute, is the real bottleneck during inference, shuttling smaller numbers around is a genuine, measurable speedup, not just a smaller download.

## A practical download guide

When you're staring at the Ollama or Hugging Face list, this is the decision in plain terms:

- **Start at `q4_K_M`.** It's the best balance of quality, speed, and size for the vast majority of uses. If it fits and feels good, you're done.
- **Have VRAM to spare?** Step up to `q5_K_M` or `q8_0` for a bit more polish, or better, jump to the next model size up at `q4`.
- **Tight on memory?** Drop to `q4_K_S` or a smaller model. Below 4-bit (2–3 bit) quality starts falling off a cliff; only go there if you truly must.
- **Maximize the model, not the bits.** Given a memory budget, a larger model quantized harder usually wins.

## The mistake that will cost you days

Quantization is nearly free for chat, coding help, summarization, and most general tasks. But there are two places where aggressive quantization quietly breaks production systems, and this is the section to actually remember.

**Never quantize embedding models for search or RAG.** This is the one that burns people. Embedding models are unusually sensitive to precision loss: a 4-bit version produces subtly shifted vectors, and that shift silently degrades retrieval. Nothing crashes. No error shows up. Your RAG pipeline just starts surfacing slightly-wrong chunks, and you can lose *days* digging through your prompts and chunking logic when the real culprit was the quantized embedding model. Keep embedding models at full precision. Always.

**Be conservative with high-stakes text.** For legal, medical, or compliance work, the model occasionally dropping a clause or flipping a negation isn't a cosmetic glitch, it's a liability. Lean toward `q8` or full precision, and validate carefully before you trust it.

## The one-paragraph takeaway

Quantization reduces how many bits each model weight uses, from 16 down to 8 or 4. Fewer bits means less memory, faster loading, and models that fit on hardware you actually own. The quality hit is small because model weights are well-behaved enough to round safely, and modern `_K_` quants are smart about *which* weights to protect. So the next time you're pulling a model: **start at `q4_K_M`, go as big as your memory allows, and only reach for higher precision when the task genuinely demands it.** That single habit will get you better local models than most people running them today.
