import json
from collections import defaultdict
import statistics

# JSON 파일 경로를 입력하세요
json_file_path = "knowledge_graph.json"

# 데이터 로드
with open(json_file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# 분석을 위한 데이터 구조
equipment_analysis = defaultdict(lambda: {
    'count': 0,
    'nozzle_counts': [],
    'nozzle_names': set(),
    'equipment_ids': [],
    'as_source': defaultdict(set),  # 출력으로 사용된 노즐
    'as_target': defaultdict(set)   # 입력으로 사용된 노즐
})

# 1. 장비 노드 분석
equipment_nodes = [n for n in data['nodes'] if n['label'] == 'Equipment']
nozzle_nodes = [n for n in data['nodes'] if n['label'] == 'Nozzle']
connections = [l for l in data['links'] if l['type'] == 'CONNECTED_BY_LINE']

print("="*80)
print("P&ID 지식 그래프 상세 통계 분석")
print("="*80)
print(f"\n총 장비 수: {len(equipment_nodes)}")
print(f"총 노즐 수: {len(nozzle_nodes)}")
print(f"총 연결 수: {len(connections)}")
print("="*80)

# 2. 각 장비의 노즐 개수 계산
for eq in equipment_nodes:
    eq_class = eq['class_name']
    eq_id = eq['db_id']
    
    # 해당 장비의 노즐들 찾기
    eq_nozzles = [n for n in nozzle_nodes if n.get('equipment_id') == eq_id]
    nozzle_count = len(eq_nozzles)
    
    equipment_analysis[eq_class]['count'] += 1
    equipment_analysis[eq_class]['nozzle_counts'].append(nozzle_count)
    equipment_analysis[eq_class]['equipment_ids'].append(eq_id)
    
    # 노즐 이름 수집
    for noz in eq_nozzles:
        if noz.get('subtag'):
            equipment_analysis[eq_class]['nozzle_names'].add(noz['subtag'])

# 3. 연결 분석으로 입력/출력 노즐 파악
for conn in connections:
    source_noz = next((n for n in nozzle_nodes if n['id'] == conn['source']), None)
    target_noz = next((n for n in nozzle_nodes if n['id'] == conn['target']), None)
    
    if source_noz and target_noz:
        # 출발 장비 찾기
        source_eq = next((e for e in equipment_nodes if e['db_id'] == source_noz.get('equipment_id')), None)
        target_eq = next((e for e in equipment_nodes if e['db_id'] == target_noz.get('equipment_id')), None)
        
        if source_eq and source_noz.get('subtag'):
            equipment_analysis[source_eq['class_name']]['as_source'][source_eq['db_id']].add(source_noz['subtag'])
        
        if target_eq and target_noz.get('subtag'):
            equipment_analysis[target_eq['class_name']]['as_target'][target_eq['db_id']].add(target_noz['subtag'])

# 4. 결과 출력
print("\n" + "="*80)
print("장비 종류별 상세 통계")
print("="*80)

for eq_class in sorted(equipment_analysis.keys()):
    info = equipment_analysis[eq_class]
    nozzle_counts = info['nozzle_counts']
    
    print(f"\n📦 {eq_class}")
    print(f"   {'─'*70}")
    print(f"   장비 개수: {info['count']}개")
    
    if nozzle_counts:
        print(f"   노즐 개수:")
        print(f"      - 최소: {min(nozzle_counts)}개")
        print(f"      - 최대: {max(nozzle_counts)}개")
        print(f"      - 평균: {statistics.mean(nozzle_counts):.2f}개")
        print(f"      - 중앙값: {statistics.median(nozzle_counts):.1f}개")
    else:
        print(f"   노즐 개수: 노즐 정보 없음")
    
    # 노즐 이름 목록
    if info['nozzle_names']:
        nozzle_list = sorted(info['nozzle_names'], key=lambda x: (x[0], int(''.join(filter(str.isdigit, x))) if any(c.isdigit() for c in x) else 0))
        print(f"   사용된 노즐 이름: {', '.join(nozzle_list)}")
    else:
        print(f"   사용된 노즐 이름: 없음")
    
    # 입출력 패턴 분석
    all_source_nozzles = set()
    all_target_nozzles = set()
    
    for eq_id in info['equipment_ids']:
        all_source_nozzles.update(info['as_source'].get(eq_id, set()))
        all_target_nozzles.update(info['as_target'].get(eq_id, set()))
    
    if all_source_nozzles or all_target_nozzles:
        print(f"   입출력 패턴 (실제 연결 기반):")
        if all_source_nozzles:
            print(f"      🔴 출력(OUT): {', '.join(sorted(all_source_nozzles))}")
        if all_target_nozzles:
            print(f"      🟢 입력(IN):  {', '.join(sorted(all_target_nozzles))}")
    else:
        print(f"   입출력 패턴: 연결 정보 없음 (추론 불가)")

print("\n" + "="*80)
print("분석 완료")
print("="*80)

# 5. 추가 통계: 가장 많은 노즐을 가진 장비
print("\n" + "="*80)
print("추가 인사이트")
print("="*80)

# 가장 많은 노즐을 가진 장비 타입
max_avg_nozzles = max([(eq_class, statistics.mean(info['nozzle_counts'])) 
                        for eq_class, info in equipment_analysis.items() 
                        if info['nozzle_counts']], 
                       key=lambda x: x[1])
print(f"\n🔝 평균 노즐 수가 가장 많은 장비: {max_avg_nozzles[0]} ({max_avg_nozzles[1]:.2f}개)")

# 가장 많은 장비 타입
max_count = max(equipment_analysis.items(), key=lambda x: x[1]['count'])
print(f"📊 가장 많은 장비 타입: {max_count[0]} ({max_count[1]['count']}개)")

# 노즐 명명 규칙 분석
all_nozzle_names = set()
for info in equipment_analysis.values():
    all_nozzle_names.update(info['nozzle_names'])

print(f"\n🏷️  전체 데이터에서 발견된 노즐 이름 패턴:")
print(f"   {', '.join(sorted(all_nozzle_names, key=lambda x: (x[0], int(''.join(filter(str.isdigit, x))) if any(c.isdigit() for c in x) else 0)))}")

# 6. 장비 간 연결 패턴 분석
print("\n" + "="*80)
print("장비 간 연결 패턴 분석")
print("="*80)

connection_patterns = defaultdict(lambda: {
    'count': 0,
    'examples': []
})

for conn in connections:
    source_noz = next((n for n in nozzle_nodes if n['id'] == conn['source']), None)
    target_noz = next((n for n in nozzle_nodes if n['id'] == conn['target']), None)
    
    if source_noz and target_noz:
        source_eq = next((e for e in equipment_nodes if e['db_id'] == source_noz.get('equipment_id')), None)
        target_eq = next((e for e in equipment_nodes if e['db_id'] == target_noz.get('equipment_id')), None)
        
        if source_eq and target_eq:
            pattern_key = f"{source_eq['class_name']} → {target_eq['class_name']}"
            connection_patterns[pattern_key]['count'] += 1
            
            # 예시 저장 (최대 3개까지)
            if len(connection_patterns[pattern_key]['examples']) < 3:
                example = {
                    'from_tag': source_eq.get('tag_name', 'N/A'),
                    'from_nozzle': source_noz.get('subtag', 'N/A'),
                    'to_tag': target_eq.get('tag_name', 'N/A'),
                    'to_nozzle': target_noz.get('subtag', 'N/A'),
                    'line': conn.get('line_number', 'N/A')
                }
                connection_patterns[pattern_key]['examples'].append(example)

# 연결 패턴을 빈도순으로 정렬
sorted_patterns = sorted(connection_patterns.items(), key=lambda x: x[1]['count'], reverse=True)

if sorted_patterns:
    print("\n🔗 장비 간 연결 빈도:")
    print(f"   (총 {len(connections)}개 연결, {len(sorted_patterns)}가지 패턴)\n")
    
    for i, (pattern, info) in enumerate(sorted_patterns, 1):
        source_class, target_class = pattern.split(' → ')
        print(f"   {i}. {pattern}")
        print(f"      빈도: {info['count']}회 ({info['count']/len(connections)*100:.1f}%)")
        
        # 예시 출력
        if info['examples']:
            print(f"      예시:")
            for ex in info['examples']:
                print(f"         • {ex['from_tag']}({ex['from_nozzle']}) → {ex['to_tag']}({ex['to_nozzle']}) [라인: {ex['line']}]")
        print()
    
    # 장비 타입별 입출력 요약
    print("="*80)
    print("장비 타입별 연결 요약")
    print("="*80)
    
    # 각 장비 타입이 출력하는 장비들
    outgoing = defaultdict(lambda: defaultdict(int))
    incoming = defaultdict(lambda: defaultdict(int))
    
    for pattern, info in sorted_patterns:
        source, target = pattern.split(' → ')
        outgoing[source][target] += info['count']
        incoming[target][source] += info['count']
    
    # 출력 패턴
    print("\n📤 각 장비가 주로 연결되는 후속 장비 (출력):")
    for eq_class in sorted(outgoing.keys()):
        targets = outgoing[eq_class]
        total = sum(targets.values())
        print(f"\n   {eq_class} ({total}개 연결)")
        for target, count in sorted(targets.items(), key=lambda x: x[1], reverse=True):
            print(f"      → {target}: {count}회 ({count/total*100:.1f}%)")
    
    # 입력 패턴
    print("\n📥 각 장비가 주로 받는 입력 (입력):")
    for eq_class in sorted(incoming.keys()):
        sources = incoming[eq_class]
        total = sum(sources.values())
        print(f"\n   {eq_class} ({total}개 연결)")
        for source, count in sorted(sources.items(), key=lambda x: x[1], reverse=True):
            print(f"      ← {source}: {count}회 ({count/total*100:.1f}%)")
    
else:
    print("\n⚠️  연결 데이터가 없습니다.")

print("\n" + "="*80)
print("전체 분석 완료")
print("="*80)