"""Extract missing anime episode frames through the Telegram range streamer."""
import json
import os
import random
import re
import subprocess
import tempfile
from pathlib import Path

FRAME_ROOT = Path('web/frames/anime')
RAW_BASE = 'https://raw.githubusercontent.com/MazoPlatforms/autowa/main/web/frames/anime/'

def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)

def safe_name(value):
    return re.sub(r'[^a-z0-9]+', '-', str(value or '').casefold()).strip('-')[:70] or 'anime'

def should_process(show, episode):
    requested = os.getenv('FRAME_TITLE', '').strip().casefold()
    if requested and requested not in str(show.get('title', '')).casefold():
        return False
    if os.getenv('FRAME_SPECIAL_ONLY', '0') == '1' and episode.get('special_type') != 'OAD':
        return False
    poster = str(show.get('poster') or '')
    # Remove the old bad fallback before deciding whether extraction is needed.
    if poster and episode.get('frame') == poster:
        episode.pop('frame', None)
    return not episode.get('frame') and episode.get('telegram_message_id')

def extract_frame(show, episode, output):
    message_id = int(episode['telegram_message_id'])
    size = int(episode.get('file_size') or 0)
    if size <= 0:
        return False
    with tempfile.TemporaryDirectory(prefix='filmgo-frame-') as temp:
        video = Path(temp) / 'episode.video'
        with video.open('wb') as handle:
            for start in range(0, size, 32 * 1024 * 1024):
                length = min(32 * 1024 * 1024, size - start)
                child = subprocess.Popen(
                    ['python3', 'src/telegram_stream.py', str(message_id), str(start), str(length), os.environ['TELEGRAM_ANIME_CHANNEL_ID']],
                    stdout=handle, stderr=subprocess.PIPE, env=os.environ.copy(),
                )
                _, stderr = child.communicate()
                if child.returncode:
                    print(f'frame {message_id}: stream failed at {start}: {stderr.decode(errors="replace")[-300:]}')
                    return False
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True).strip())
        seek = random.Random(message_id).uniform(max(1, duration * .12), max(1, duration * .88))
        run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{seek:.3f}', '-i', str(video), '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', str(output)], timeout=180)
    return output.exists() and output.stat().st_size > 0

def main():
    data_path = Path('data/anime.json')
    data = json.loads(data_path.read_text(encoding='utf-8'))
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    changed = 0
    for show in data.get('anime', []):
        for episode in show.get('episodes', []):
            if not should_process(show, episode):
                continue
            number = int(episode.get('episode') or episode.get('number') or 0)
            collection = safe_name(episode.get('special_type') or f"season-{episode.get('season') or 1}")
            filename = f"{safe_name(show.get('slug_id') or show.get('title'))}-{collection}-{number:03d}.jpg"
            output = FRAME_ROOT / filename
            print(f"extracting {show.get('title')} · {episode.get('special_type') or 'S'+str(episode.get('season') or 1)}E{number}", flush=True)
            try:
                if extract_frame(show, episode, output):
                    episode['frame'] = RAW_BASE + filename
                    changed += 1
            except Exception as error:
                print(f'frame {episode.get("telegram_message_id")} skipped: {error}', flush=True)
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    out = Path('data/anime')
    out.mkdir(exist_ok=True)
    for show in data.get('anime', []):
        (out / f"{show['slug_id']}.json").write_text(json.dumps({'schema_version': 1, 'updated_at': data.get('updated_at'), 'anime': show}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index = {'schema_version': 1, 'updated_at': data.get('updated_at'), 'anime': [{k: v for k, v in show.items() if k != 'episodes'} for show in data.get('anime', [])]}
    (out / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'frames_updated={changed}')

if __name__ == '__main__':
    main()
