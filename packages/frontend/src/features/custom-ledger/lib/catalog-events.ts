/**
 * 自由定義の台帳（ObjectType）catalog の変更を、同じ dashboard セッションの購読側へ知らせる module-level の口。
 *
 * なぜ必要か: 左メニュー（Sidebar）は dashboard 共通レイアウトが保持する client component で、
 * catalog を mount 時に一度だけ取得する。台帳の作成・編集後に router.push しても component は
 * 再 mount されないため、保存結果がメニューへ反映されない（新規台帳が出ない・編集した名称/アイコン/
 * 表示順が古いまま）。mutation 側から「catalog が変わった」ことを明示的に知らせ、再取得の契機を
 * 1か所へ集める。
 *
 * 権限キャッシュ（PermissionsProvider）は別の口（usePermissions().refresh）で更新する。新規台帳は
 * 動的 featureId `object-type:<key>` を増やすため、catalog だけ取り直しても閲覧権限の判定は古いままになる。
 */
type CatalogListener = () => void;

const listeners = new Set<CatalogListener>();

/**
 * 台帳の作成・編集が成功した後に呼ぶ。購読側（Sidebar）が catalog を取り直す。
 * 1つの listener の例外で他の listener を止めない。
 */
export function invalidateObjectTypeCatalog(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // 再取得の失敗は購読側の catch が吸収する。通知自体は残りへ続ける。
    }
  }
}

/** 台帳 catalog の再取得が必要になった時に呼ばれる関数を登録する。戻り値を呼ぶと解除する。 */
export function subscribeObjectTypeCatalog(listener: CatalogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
