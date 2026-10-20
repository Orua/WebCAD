"""Download authenticated Agent diagnostics and task events without running a task.

Run with the existing Goldenluck Agent Python environment. Credentials remain in
memory; reports go to G: and never contain authorization headers or source blobs.
"""
import argparse
import concurrent.futures
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request


def scrub(value):
    if isinstance(value, dict):
        return {k: ("[redacted]" if re.search(r"^(authorization|cookie|password|credential|token|apiKey|secret|dataBase64|base64)$", k, re.I) else scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [redacted]", value, flags=re.I)
        value = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted-jwt]", value)
        return re.sub(r"[A-Za-z0-9+/]{4096,}={0,2}", "[omitted binary payload]", value)
    return value


def main():
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://10.121.11.113:4321')
    parser.add_argument('--since', default=now.strftime('%Y-%m-%dT12:00:00+08:00'))
    parser.add_argument('--until', default='')
    parser.add_argument('--output', default=f'G:/CAD-Workspace/WebCAD/logs/113-{now:%Y%m%d-%H%M%S}')
    parser.add_argument('--auth-helper', default='F:/金大福生产/agent/tools/generate_admin_jwt.py')
    parser.add_argument('--max-tasks', type=int, default=200)
    args = parser.parse_args()
    # Agent persistence compares UTC ISO strings. Normalize the user's local time
    # before filtering; comparing a +08:00 timestamp as text drops afternoon logs.
    def utc(value):
        if not value:
            return ''
        parsed_time = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed_time.tzinfo is None:
            parsed_time = parsed_time.replace(tzinfo=dt.timezone(dt.timedelta(hours=8)))
        return parsed_time.astimezone(dt.timezone.utc).isoformat()
    args.since, args.until = utc(args.since), utc(args.until)
    parsed = urllib.parse.urlsplit(args.url)
    if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('10.121.11.113', '127.0.0.1', 'localhost', '10.121.11.223') or parsed.username or parsed.password:
        parser.error('Use an existing trusted Goldenluck Agent endpoint')
    output = Path(args.output)
    if output.drive.upper() != 'G:':
        parser.error('Diagnostic output must be on G:')
    if not 1 <= args.max_tasks <= 1000:
        parser.error('max-tasks must be 1..1000')
    spec = importlib.util.spec_from_file_location('goldenluck_auth', args.auth_helper)
    auth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auth)
    token = auth.generate_admin_jwt(auth.PRIVATE_KEY_PATH)
    output.mkdir(parents=True, exist_ok=True)

    def read(route):
        request = urllib.request.Request(args.url.rstrip('/') + route, headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(request, timeout=25) as response:
            return scrub(json.load(response))

    def save(name, value):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

    for route, name in [('/health', 'health.json'), ('/api/diagnostics', 'runtime.json'), ('/api/diagnostics/logs?maxBytes=65536&maxFiles=4', 'runtime-log-tails.json')]:
        try:
            save(name, read(route))
        except Exception as error:
            save(name, {'error': str(error)})
    bridge_files = []
    bridge_root = Path(os.environ.get('LOCALAPPDATA', '')) / 'lan-bridge/logs'
    for path in sorted(bridge_root.glob('bridge.log*'), key=lambda p: p.stat().st_mtime, reverse=True)[:2]:
        with path.open('rb') as stream:
            size = path.stat().st_size
            stream.seek(max(0, size-131072))
            data = stream.read(131072)
        if size > 131072:
            data = data.partition(b'\n')[2]
        bridge_files.append({'name': path.name, 'truncated': size > 131072, 'text': scrub(data.decode('utf-8', errors='replace'))})
    save('local-bridge-log-tails.json', bridge_files)
    tasks, cursor, next_cursor = [], '', None
    while len(tasks) < args.max_tasks:
        query = {'createdAfter': args.since, 'limit': min(200, args.max_tasks-len(tasks))}
        if args.until:
            query['createdBefore'] = args.until
        if cursor:
            query['cursor'] = cursor
        listing = read('/api/tasks?' + urllib.parse.urlencode(query))
        tasks.extend(listing.get('tasks', []))
        next_cursor = listing.get('nextCursor')
        if not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor
    save('tasks.json', {'since': args.since, 'until': args.until, 'tasks': tasks, 'truncated': bool(next_cursor)})

    def collect(task):
        task_id = task['taskId']
        try:
            detail = read('/api/tasks/' + urllib.parse.quote(task_id, safe=''))
            events = read('/api/tasks/' + urllib.parse.quote(task_id, safe='') + '/events?after=0')
            save(task_id + '.json', {'task': detail, 'events': events})
            return {'taskId': task_id, 'status': task['status'], 'createdAt': task.get('createdAt'), 'message': task.get('message', '')[:300], 'events': len(events.get('events', [])), 'file': task_id+'.json'}
        except Exception as error:
            return {'taskId': task_id, 'error': str(error)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        summary = list(pool.map(collect, tasks))
    save('summary.json', summary)
    print(json.dumps({'output': str(output), 'tasks': len(tasks), 'errors': sum('error' in row for row in summary)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
