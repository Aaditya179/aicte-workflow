from supabase import create_client, Client
from core.config import settings
from typing import Any, List, Optional, Dict
import uuid
import copy

class MockTableResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data

class MemoryTableQuery:
    def __init__(self, db_mem: Dict[str, List[Dict[str, Any]]], table_name: str):
        self.db_mem = db_mem
        self.table_name = table_name
        if table_name not in self.db_mem:
            self.db_mem[table_name] = []
        self._filters = []
        self._order_field = None
        self._order_desc = False
        self._limit = None

    def select(self, fields: str = "*"):
        return self

    def eq(self, column: str, value: Any):
        self._filters.append((column, "eq", value))
        return self

    def in_(self, column: str, values: List[Any]):
        self._filters.append((column, "in", values))
        return self

    def order(self, column: str, desc: bool = False):
        self._order_field = column
        self._order_desc = desc
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def execute(self) -> MockTableResult:
        rows = self.db_mem.get(self.table_name, [])
        filtered = []
        for r in rows:
            match = True
            for col, op, val in self._filters:
                r_val = r.get(col)
                if op == "eq" and str(r_val) != str(val):
                    match = False
                    break
                elif op == "in" and r_val not in val:
                    match = False
                    break
            if match:
                filtered.append(copy.deepcopy(r))

        if self._order_field:
            filtered.sort(key=lambda x: x.get(self._order_field) or "", reverse=self._order_desc)

        if self._limit is not None:
            filtered = filtered[:self._limit]

        return MockTableResult(filtered)

    def insert(self, record: Any) -> MockTableResult:
        if isinstance(record, list):
            inserted = []
            for item in record:
                row = copy.deepcopy(item)
                if "id" not in row:
                    row["id"] = str(uuid.uuid4())
                self.db_mem[self.table_name].append(row)
                inserted.append(row)
            return MockTableResult(inserted)
        else:
            row = copy.deepcopy(record)
            if "id" not in row:
                row["id"] = str(uuid.uuid4())
            self.db_mem[self.table_name].append(row)
            return MockTableResult([row])

    def update(self, updates: Dict[str, Any]) -> MockTableResult:
        rows = self.db_mem.get(self.table_name, [])
        updated = []
        for r in rows:
            match = True
            for col, op, val in self._filters:
                if op == "eq" and str(r.get(col)) != str(val):
                    match = False
                    break
            if match:
                r.update(copy.deepcopy(updates))
                updated.append(copy.deepcopy(r))
        return MockTableResult(updated)

    def delete(self) -> MockTableResult:
        rows = self.db_mem.get(self.table_name, [])
        remaining = []
        deleted = []
        for r in rows:
            match = True
            for col, op, val in self._filters:
                if op == "eq" and str(r.get(col)) != str(val):
                    match = False
                    break
            if match:
                deleted.append(r)
            else:
                remaining.append(r)
        self.db_mem[self.table_name] = remaining
        return MockTableResult(deleted)


class Database:
    def __init__(self):
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        self._memory_db: Dict[str, List[Dict[str, Any]]] = {
            "decisions": [],
            "decision_evidence": [],
            "assurance_reports": [],
            "assurance_flags": [],
            "approval_requests": [],
            "mandatory_evidence": [],
            "evc_availability": [],
            "message_templates": [],
            "document_access_log": []
        }
        self._v2_tables = set(self._memory_db.keys())

    def table(self, table_name: str):
        if table_name in self._v2_tables:
            return MemoryTableQuery(self._memory_db, table_name)
        return self.client.table(table_name)

    def rpc(self, fn: str, params: Optional[Dict[str, Any]] = None):
        return self.client.rpc(fn, params or {})

    def fetch_all(self, table_name: str, **filters) -> List[Dict[str, Any]]:
        try:
            query = self.table(table_name).select("*")
            for k, v in filters.items():
                query = query.eq(k, v)
            res = query.execute()
            return res.data or []
        except Exception:
            return MemoryTableQuery(self._memory_db, table_name).select("*").execute().data or []

    def fetch_one(self, table_name: str, **filters) -> Optional[Dict[str, Any]]:
        try:
            query = self.table(table_name).select("*")
            for k, v in filters.items():
                query = query.eq(k, v)
            res = query.limit(1).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return None
        except Exception:
            rows = MemoryTableQuery(self._memory_db, table_name).select("*").execute().data or []
            for r in rows:
                if all(str(r.get(k)) == str(v) for k, v in filters.items()):
                    return r
            return None

    def insert(self, table_name: str, record: Dict[str, Any]) -> Dict[str, Any]:
        try:
            res = self.table(table_name).insert(record).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return {}
        except Exception:
            # Fallback to local memory table
            mem = MemoryTableQuery(self._memory_db, table_name).insert(record)
            return mem.data[0] if mem.data else {}

    def update(self, table_name: str, record_id: str, updates: Dict[str, Any], id_field: str = "id") -> Dict[str, Any]:
        try:
            res = self.table(table_name).update(updates).eq(id_field, record_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return {}
        except Exception:
            mem = MemoryTableQuery(self._memory_db, table_name).eq(id_field, record_id).update(updates)
            return mem.data[0] if mem.data else {}

    def delete(self, table_name: str, record_id: str, id_field: str = "id") -> bool:
        try:
            res = self.table(table_name).delete().eq(id_field, record_id).execute()
            return bool(res.data)
        except Exception:
            mem = MemoryTableQuery(self._memory_db, table_name).eq(id_field, record_id).delete()
            return bool(mem.data)

db = Database()
