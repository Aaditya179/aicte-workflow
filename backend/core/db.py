from supabase import create_client, Client
from core.config import settings
from typing import Any, List, Optional, Dict

class Database:
    def __init__(self):
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    def table(self, table_name: str):
        return self.client.table(table_name)

    def rpc(self, fn: str, params: Optional[Dict[str, Any]] = None):
        return self.client.rpc(fn, params or {})

    def fetch_all(self, table_name: str, **filters) -> List[Dict[str, Any]]:
        query = self.client.table(table_name).select("*")
        for k, v in filters.items():
            query = query.eq(k, v)
        res = query.execute()
        return res.data or []

    def fetch_one(self, table_name: str, **filters) -> Optional[Dict[str, Any]]:
        query = self.client.table(table_name).select("*")
        for k, v in filters.items():
            query = query.eq(k, v)
        res = query.limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None

    def insert(self, table_name: str, record: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.table(table_name).insert(record).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return {}

    def update(self, table_name: str, record_id: str, updates: Dict[str, Any], id_field: str = "id") -> Dict[str, Any]:
        res = self.client.table(table_name).update(updates).eq(id_field, record_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return {}

    def delete(self, table_name: str, record_id: str, id_field: str = "id") -> bool:
        res = self.client.table(table_name).delete().eq(id_field, record_id).execute()
        return bool(res.data)

db = Database()
