UPDATE public.lessons
SET content = replace(
  content,
  E'## Diagram (Animal Cell)\n```\n        ┌───────────────┐\n        │  Nucleus (DNA) │\n        ├───────────────┤\n        │  Mitochondrion │  <- energy (ATP)\n        │  Ribosomes     │  <- proteins\n        │  Golgi         │  <- packaging\n        │  ER            │  <- transport\n        └───────────────┘\n```',
  E'## Diagram (Animal Cell)\n![Labelled diagram of an animal cell showing the nucleus, mitochondria, ribosomes, Golgi apparatus and endoplasmic reticulum](/__l5e/assets-v1/6252c94f-2864-45ec-a389-059696f26844/animal-cell.png)'
)
WHERE id = '1ee33ff6-d609-4024-bc29-2a77d96ce134';