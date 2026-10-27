from supabase import create_client, Client
from core.config import settings
from typing import Any, List, Optional, Dict
import uuid
import copy
import logging

class MockTableResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data

class MemoryTableQuery:
    """In-process stand-in for a PostgREST query builder: chain filters, then execute()."""

    def __init__(self, db_mem: Dict[str, List[Dict[str, Any]]], table_name: str):
        self.db_mem = db_mem
        self.table_name = table_name
        self.db_mem.setdefault(table_name, [])
        self._filters = []
        self._order_field = None
        self._order_desc = False
        self._limit = None
        self._op = "select"
        self._payload: Any = None

    def select(self, fields: str = "*", **_):
        return self

    def eq(self, column: str, value: Any):
        self._filters.append((column, "eq", value))
        return self

    def neq(self, column: str, value: Any):
        self._filters.append((column, "neq", value))
        return self

    def in_(self, column: str, values: List[Any]):
        self._filters.append((column, "in", [str(v) for v in values]))
        return self

    def gte(self, column: str, value: Any):
        self._filters.append((column, "gte", value))
        return self

    def order(self, column: str, desc: bool = False):
        self._order_field = column
        self._order_desc = desc
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def insert(self, record: Any):
        self._op, self._payload = "insert", record
        return self

    def update(self, updates: Dict[str, Any]):
        self._op, self._payload = "update", updates
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _matches(self, row: Dict[str, Any]) -> bool:
        for col, op, val in self._filters:
            r_val = row.get(col)
            if op == "eq" and str(r_val) != str(val):
                return False
            if op == "neq" and str(r_val) == str(val):
                return False
            if op == "in" and str(r_val) not in val:
                return False
            if op == "gte" and (r_val is None or str(r_val) < str(val)):
                return False
        return True

    def execute(self) -> MockTableResult:
        rows = self.db_mem[self.table_name]
        if self._op == "insert":
            inserted = []
            for item in (self._payload if isinstance(self._payload, list) else [self._payload]):
                row = copy.deepcopy(item)
                row.setdefault("id", str(uuid.uuid4()))
                rows.append(row)
                inserted.append(copy.deepcopy(row))
            return MockTableResult(inserted)
        if self._op == "update":
            updated = []
            for r in rows:
                if self._matches(r):
                    r.update(copy.deepcopy(self._payload))
                    updated.append(copy.deepcopy(r))
            return MockTableResult(updated)
        if self._op == "delete":
            deleted = [r for r in rows if self._matches(r)]
            self.db_mem[self.table_name] = [r for r in rows if not self._matches(r)]
            return MockTableResult(deleted)

        filtered = [copy.deepcopy(r) for r in rows if self._matches(r)]
        if self._order_field:
            filtered.sort(key=lambda x: x.get(self._order_field) or "", reverse=self._order_desc)
        if self._limit is not None:
            filtered = filtered[:self._limit]
        return MockTableResult(filtered)


logger = logging.getLogger("aicte.db")

# Tables created by migration 0004_v2.sql. Until that migration is applied they are served from
# process memory (lost on restart, not shared between instances) so the v2 features still demo.
V2_TABLES = (
    "decisions", "decision_evidence", "assurance_reports", "assurance_flags", "approval_requests",
    "mandatory_evidence", "evc_availability", "message_templates", "communications", "document_access_log",
)


class Database:
    def __init__(self):
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        self._memory_db: Dict[str, List[Dict[str, Any]]] = {}
        self._in_memory: Dict[str, bool] = {}

    def _uses_memory(self, table_name: str) -> bool:
        if table_name not in V2_TABLES:
            return False
        if table_name not in self._in_memory:
            try:
                self.client.table(table_name).select("*").limit(1).execute()
                self._in_memory[table_name] = False
            except Exception:
                logger.warning(f"Table '{table_name}' not found; using in-memory storage. Apply migration 0004_v2.sql.")
                self._in_memory[table_name] = True
        return self._in_memory[table_name]

    def table(self, table_name: str):
        if self._uses_memory(table_name):
            return MemoryTableQuery(self._memory_db, table_name)
        return self.client.table(table_name)

    def rpc(self, fn: str, params: Optional[Dict[str, Any]] = None):
        return self.client.rpc(fn, params or {})

    def fetch_all(self, table_name: str, **filters) -> List[Dict[str, Any]]:
        query = self.table(table_name).select("*")
        for k, v in filters.items():
            query = query.eq(k, v)
        return query.execute().data or []

    def fetch_one(self, table_name: str, **filters) -> Optional[Dict[str, Any]]:
        query = self.table(table_name).select("*")
        for k, v in filters.items():
            query = query.eq(k, v)
        res = query.limit(1).execute()
        return res.data[0] if res.data else None

    def insert(self, table_name: str, record: Dict[str, Any]) -> Dict[str, Any]:
        res = self.table(table_name).insert(record).execute()
        return res.data[0] if res.data else {}

    def update(self, table_name: str, record_id: str, updates: Dict[str, Any], id_field: str = "id") -> Dict[str, Any]:
        res = self.table(table_name).update(updates).eq(id_field, record_id).execute()
        return res.data[0] if res.data else {}

    def delete(self, table_name: str, record_id: str, id_field: str = "id") -> bool:
        res = self.table(table_name).delete().eq(id_field, record_id).execute()
        return bool(res.data)

db = Database()
