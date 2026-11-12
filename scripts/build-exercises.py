"""
Genera la biblioteca de técnica a partir de hasaneyldrm/exercises-dataset (MIT; medios © Gym visual).

Uso:  python3 -I scripts/build-exercises.py <carpeta-del-dataset> <carpeta-del-repo>

Solo toma los ejercicios de tu rutina y unas alternativas por ejercicio (no los 1,324),
copia su miniatura y su GIF a public/ex/ y escribe src/hq/exercise-db.gen.ts.
"""
import json
import shutil
import sys
from pathlib import Path

# id de la rutina (src/hq/training.ts LIB) → [principal, alternativas…]  (id del dataset, nombre en español, ¿se puede en casa?)
CURATION = {
    "sentadilla": [("0043", "Sentadilla con barra"), ("1760", "Sentadilla goblet con mancuerna"), ("0743", "Hack squat en máquina"), ("0739", "Prensa de pierna 45°"), ("0514", "Sentadilla con salto")],
    "prensa": [("0739", "Prensa de pierna 45°"), ("0743", "Hack squat en máquina"), ("1425", "Prensa a una pierna"), ("1760", "Sentadilla goblet con mancuerna")],
    "pesoMuerto": [("0085", "Peso muerto rumano con barra"), ("1459", "Peso muerto rumano con mancuernas"), ("0117", "Peso muerto sumo"), ("0549", "Swing con kettlebell"), ("3193", "Glute-ham raise")],
    "hipThrust": [("1409", "Hip thrust / puente con barra"), ("3562", "Puente con barra, pies en banca"), ("3523", "Puente de glúteo con pies en banca"), ("3013", "Puente de glúteo en el piso")],
    "zancada": [("0410", "Zancada búlgara con mancuerna"), ("0054", "Zancada con barra"), ("1460", "Zancadas caminando"), ("3769", "Sentadilla cruzada (curtsy)"), ("1476", "Sentadilla a una pierna")],
    "femoral": [("0586", "Curl femoral acostado"), ("0599", "Curl femoral sentado"), ("0496", "Curl femoral inverso en banca"), ("3193", "Glute-ham raise")],
    "extension": [("0585", "Extensión de cuádriceps"), ("1760", "Sentadilla goblet con mancuerna"), ("0743", "Hack squat en máquina"), ("1476", "Sentadilla a una pierna")],
    "pantorrilla": [("1372", "Pantorrilla de pie con barra"), ("0594", "Pantorrilla sentado en máquina"), ("1375", "Pantorrilla de pie en polea"), ("1373", "Pantorrilla de pie sin peso")],
    "banca": [("0025", "Press de banca con barra"), ("0289", "Press de banca con mancuernas"), ("0577", "Press de pecho en máquina"), ("0308", "Aperturas con mancuernas"), ("0662", "Lagartijas")],
    "inclinado": [("0314", "Press inclinado con mancuernas"), ("0047", "Press inclinado con barra"), ("0319", "Aperturas inclinadas con mancuernas"), ("0279", "Lagartija declinada (pies arriba)")],
    "militar": [("1457", "Press militar con barra"), ("0405", "Press de hombro sentado con mancuernas"), ("0219", "Press de hombro en polea"), ("0997", "Press de hombro con liga")],
    "lateral": [("0334", "Elevaciones laterales con mancuernas"), ("0178", "Elevación lateral en polea"), ("0311", "Elevación lateral 'full can'")],
    "jalon": [("2330", "Jalón al pecho en polea"), ("0818", "Jalón con agarre paralelo"), ("0673", "Jalón en máquina, agarre invertido"), ("0017", "Dominada asistida en máquina")],
    "dominada": [("0652", "Dominadas"), ("1326", "Dominadas supinas (chin-up)"), ("0017", "Dominada asistida en máquina"), ("0970", "Dominada asistida con liga"), ("0499", "Remo invertido")],
    "remo": [("0027", "Remo con barra"), ("0861", "Remo sentado en polea"), ("1350", "Remo sentado en máquina"), ("0292", "Remo con mancuerna a un brazo")],
    "remoMancuerna": [("0292", "Remo con mancuerna a un brazo"), ("0861", "Remo sentado en polea"), ("1350", "Remo sentado en máquina"), ("0499", "Remo invertido")],
    "facePull": [("0203", "Face pull: remo posterior en polea con cuerda"), ("0383", "Pájaros con mancuernas"), ("0993", "Aperturas inversas con liga")],
    "fondos": [("0251", "Fondos en paralelas"), ("0030", "Press cerrado con barra"), ("0009", "Fondos asistidos en máquina"), ("0129", "Fondos en banca")],
    "triceps": [("0201", "Extensión de tríceps en polea"), ("0200", "Extensión de tríceps en polea con cuerda"), ("0060", "Press francés con barra"), ("0194", "Extensión sobre la cabeza en polea"), ("0259", "Lagartija cerrada")],
    "curl": [("0294", "Curl de bíceps con mancuernas"), ("0031", "Curl con barra"), ("0313", "Curl martillo"), ("0165", "Curl martillo en polea con cuerda")],
    "plancha": [("2135", "Plancha (con o sin disco)"), ("0276", "Dead bug"), ("0630", "Escaladores"), ("3544", "Plancha lateral inclinada")],
}

EQUIP = {
    "body weight": "Sin equipo", "dumbbell": "Mancuernas", "cable": "Polea", "barbell": "Barra", "leverage machine": "Máquina",
    "band": "Liga", "resistance band": "Liga", "smith machine": "Smith", "kettlebell": "Kettlebell", "weighted": "Disco",
    "sled machine": "Máquina", "ez barbell": "Barra Z", "assisted": "Máquina asistida", "stability ball": "Pelota",
}
MUSCLE = {
    "abs": "Abdomen", "pectorals": "Pecho", "biceps": "Bíceps", "glutes": "Glúteo", "delts": "Hombro", "triceps": "Tríceps",
    "upper back": "Espalda alta", "lats": "Dorsal", "calves": "Pantorrilla", "quads": "Cuádriceps", "forearms": "Antebrazo",
    "hamstrings": "Femoral", "spine": "Espalda baja", "traps": "Trapecio", "adductors": "Aductores", "abductors": "Abductores",
    "serratus anterior": "Serrato", "cardiovascular system": "Cardio", "levator scapulae": "Cuello",
    "ankle stabilizers": "Tobillo", "ankles": "Tobillo", "chest": "Pecho", "core": "Core", "deltoids": "Hombro", "feet": "Pies",
    "hip flexors": "Flexores de cadera", "lower back": "Espalda baja", "obliques": "Oblicuos", "quadriceps": "Cuádriceps",
    "rear deltoids": "Hombro posterior", "rhomboids": "Romboides", "rotator cuff": "Manguito rotador", "shoulders": "Hombro",
    "soleus": "Sóleo", "trapezius": "Trapecio",
}
HOME = {"body weight", "band", "resistance band"}


def main(ds_dir: str, repo_dir: str) -> None:
    ds, repo = Path(ds_dir), Path(repo_dir)
    data = {e["id"]: e for e in json.loads((ds / "data/exercises.json").read_text(encoding="utf-8"))}
    out_media = repo / "public/ex"
    out_media.mkdir(parents=True, exist_ok=True)
    db, routine = {}, {}
    for lib_id, picks in CURATION.items():
        routine[lib_id] = [i for i, _ in picks]
        for ex_id, name_es in picks:
            if ex_id in db:
                continue
            e = data[ex_id]
            gif, img = ds / e["gif_url"], ds / e["image"]
            shutil.copyfile(gif, out_media / f"{ex_id}.gif")
            shutil.copyfile(img, out_media / f"{ex_id}.jpg")
            db[ex_id] = {
                "id": ex_id,
                "name": name_es,
                "en": e["name"].replace("в°", "°"),
                "target": MUSCLE.get(e["target"], e["target"]),
                "secondary": [MUSCLE.get(m, m) for m in e.get("secondary_muscles", [])][:3],
                "equipment": EQUIP.get(e["equipment"], e["equipment"]),
                "home": e["equipment"] in HOME,
                "steps": [s.strip() for s in e["instruction_steps"].get("es", []) if s.strip()][:6],
            }
    body = (
        "// Generado por scripts/build-exercises.py — no editar a mano.\n"
        "// Datos: hasaneyldrm/exercises-dataset (MIT). Imágenes y GIFs © Gym visual — https://gymvisual.com/ (con permiso; conservar crédito).\n"
        "export type ExerciseMedia = { id: string; name: string; en: string; target: string; secondary: string[]; equipment: string; home: boolean; steps: string[] };\n"
        f"export const EXERCISES: Record<string, ExerciseMedia> = {json.dumps(db, ensure_ascii=False, indent=1)};\n"
        "/** Ejercicio de la rutina → [principal, alternativas…] (ids de EXERCISES). */\n"
        f"export const ROUTINE_MEDIA: Record<string, string[]> = {json.dumps(routine, ensure_ascii=False)};\n"
    )
    (repo / "src/hq/exercise-db.gen.ts").write_text(body, encoding="utf-8")
    size = sum(f.stat().st_size for f in out_media.iterdir())
    print(f"{len(db)} ejercicios, {len(routine)} de la rutina, medios {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
