---
title: "What Does q4_K_M Even Mean? A Practitioner's Guide to LLM Quantization."
description: "You don't need to be a researcher to make smart choices when downloading models. Here's what quantization actually is, why it barely hurts quality, and how to pick the right version on Ollama or Hugging Face."
pubDate: 2026-06-20
tags: ["ai", "engineering", "llm"]
draft: false
image: "/og/llm-quantization-explained.png"
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

You'll also run into format names outside Ollama. These are the *methods* used to do the quantizing:

- **GGUF** is the format Ollama and llama.cpp use. One self-contained file, runs great on CPU or split between CPU and GPU. This is what those `q4_K_M`-style tags come from.
- **AWQ** protects the most important weights (found by watching which ones drive the biggest activations) so 4-bit rounding doesn't damage them. The go-to for fast, quality-sensitive **GPU** serving.
- **GPTQ** uses a small calibration dataset to round each layer in a way that keeps its *output* close to the original. Another strong GPU option.
- **NF4** is a 4-bit format whose steps are spaced to match that bell-curve shape of weights. It's what QLoRA uses to fine-tune big models on consumer hardware.

For local use, you'll mostly live in GGUF land. The others matter once you're serving on GPUs.

## How much quality do you really lose?

Less than you'd fear. Real benchmarks land roughly here:

- **FP16 to INT8:** often a sub-1% change. Effectively free.
- **INT8 to INT4:** a noticeable but usually small step. Think a few percent on perplexity, often near-invisible in everyday chat with good `_K_` quants.

And here's the rule of thumb that should drive your downloads:

> **A bigger model at lower precision almost always beats a smaller model at higher precision, at the same file size.**

A 70B model at `q4` will run circles around an 8B model at `q8`, even though they take up similar disk space. So the move is: pick the *largest* model your hardware can hold, then choose the quantization that makes it fit, not the other way around.

## A practical download guide

When you're staring at the Ollama or Hugging Face list, this is the decision in plain terms:

- **Start at `q4_K_M`.** It's the best balance of quality, speed, and size for the vast majority of uses. If it fits and feels good, you're done.
- **Have VRAM to spare?** Step up to `q5_K_M` or `q8_0` for a bit more polish, or better, jump to the next model size up at `q4`.
- **Tight on memory?** Drop to `q4_K_S` or a smaller model. Below 4-bit (2–3 bit) quality starts falling off a cliff; only go there if you truly must.
- **Maximize the model, not the bits.** Given a memory budget, a larger model quantized harder usually wins.

## When to be careful

Quantization is nearly free for chat, coding help, summarization, and general tasks. But precision loss bites harder in a few places:

- **High-stakes text** like legal, medical, and compliance, where the model occasionally dropping a clause or flipping a negation is a real liability. Lean toward `q8` or full precision here.
- **Embedding models** for semantic search. They're unusually sensitive; a 4-bit embedding model produces subtly shifted vectors that quietly degrade retrieval in ways that are painful to debug. Keep these at high precision.

One more honest caveat: quantization shrinks *memory*, not *compute*. The number of calculations stays the same; you're just moving smaller numbers around faster. Since memory bandwidth is usually the real bottleneck during inference, you still get a genuine speedup. It's just not magic.

## The one-paragraph takeaway

Quantization reduces how many bits each model weight uses, from 16 down to 8 or 4. Fewer bits means less memory, faster loading, and models that fit on hardware you actually own. The quality hit is small because model weights are well-behaved enough to round safely, and modern `_K_` quants are smart about *which* weights to protect. So the next time you're pulling a model: **start at `q4_K_M`, go as big as your memory allows, and only reach for higher precision when the task genuinely demands it.** That single habit will get you better local models than most people running them today.
