-- Jusqu'ici "en_cours" était en réalité utilisé comme statut "bloqué"
-- (seul chemin pour y arriver : la modale de blocage avec commentaire
-- obligatoire). On introduit un vrai statut "en_cours" distinct, donc les
-- données existantes sont reclassées en "bloque" pour conserver leur sens.
UPDATE "Task" SET "statut" = 'bloque' WHERE "statut" = 'en_cours';
UPDATE "TaskEvent" SET "statut" = 'bloque' WHERE "statut" = 'en_cours';
