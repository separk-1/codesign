import os
import shutil
import glob

# --- 설정 변수 ---
# 검색을 시작할 최상위 디렉토리
SOURCE_DIR = "pids/raw"
# XML 파일을 복사할 대상 디렉토리
DEST_DIR = "pids"
# ------------------

def copy_xml_files(source_root: str, destination_dir: str):
    """
    지정된 루트 디렉토리와 모든 하위 폴더에서 .xml 파일을 찾아 
    대상 디렉토리로 복사합니다.
    
    Args:
        source_root (str): 검색을 시작할 디렉토리 경로 (예: 'pids/raw').
        destination_dir (str): 파일을 복사할 대상 디렉토리 경로 (예: 'pids').
    """
    
    # 대상 디렉토리가 없으면 생성
    os.makedirs(destination_dir, exist_ok=True)
    print(f"대상 디렉토리 확인/생성: {destination_dir}")

    # glob을 사용하여 모든 하위 디렉토리를 재귀적으로 검색
    # os.path.join을 사용하여 경로를 안전하게 구성하고, '**/*.xml'로 재귀 검색 및 필터링
    search_pattern = os.path.join(source_root, '**', '*.xml')
    xml_files = glob.glob(search_pattern, recursive=True)
    
    if not xml_files:
        print(f"경로 {source_root} 및 하위 디렉토리에서 .xml 파일을 찾을 수 없습니다.")
        return

    print(f"총 {len(xml_files)}개의 .xml 파일을 찾았습니다. 복사를 시작합니다.")

    # 파일 복사
    copied_count = 0
    for file_path in xml_files:
        # 파일 이름만 추출
        file_name = os.path.basename(file_path)
        # 대상 파일 경로 생성
        destination_path = os.path.join(destination_dir, file_name)
        
        try:
            # 파일 복사
            # shutil.copy는 파일의 권한 모드까지 복사합니다.
            shutil.copy(file_path, destination_path)
            # print(f"복사 완료: {file_name}") # 파일이 많을 경우 출력이 길어질 수 있습니다.
            copied_count += 1
        except Exception as e:
            print(f"오류: {file_path}를 {destination_path}로 복사하는 데 실패했습니다: {e}")

    print("-" * 30)
    print(f"✅ 복사 완료: {copied_count}개의 파일이 {destination_dir}로 복사되었습니다.")
    print("-" * 30)

# 함수 실행
# 이 코드를 파이썬 파일로 저장하고 실행하면 됩니다.
if __name__ == "__main__":
    copy_xml_files(SOURCE_DIR, DEST_DIR)