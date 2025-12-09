"""Tests for the Scope class."""


from templatedx import Scope


class TestScope:
    """Tests for scope variable resolution."""

    def test_get_local_variable(self) -> None:
        scope = Scope(variables={"name": "Alice"})
        assert scope.get("name") == "Alice"

    def test_get_missing_variable_returns_none(self) -> None:
        scope = Scope()
        assert scope.get("missing") is None

    def test_get_from_parent(self) -> None:
        parent = Scope(variables={"name": "Alice"})
        child = parent.create_child()
        assert child.get("name") == "Alice"

    def test_child_shadows_parent(self) -> None:
        parent = Scope(variables={"name": "Alice"})
        child = parent.create_child(variables={"name": "Bob"})
        assert child.get("name") == "Bob"
        assert parent.get("name") == "Alice"

    def test_get_shared(self) -> None:
        scope = Scope(shared={"global_var": "value"})
        assert scope.get("global_var") == "value"

    def test_local_before_shared(self) -> None:
        scope = Scope(variables={"name": "local"}, shared={"name": "shared"})
        assert scope.get("name") == "local"

    def test_parent_before_shared(self) -> None:
        parent = Scope(variables={"name": "parent"}, shared={"name": "shared"})
        child = parent.create_child()
        assert child.get("name") == "parent"

    def test_get_local(self) -> None:
        scope = Scope(variables={"local": "value"}, shared={"shared": "other"})
        assert scope.get_local("local") == "value"
        assert scope.get_local("shared") is None

    def test_get_shared_explicit(self) -> None:
        scope = Scope(variables={"local": "value"}, shared={"shared": "other"})
        assert scope.get_shared("shared") == "other"
        assert scope.get_shared("local") is None

    def test_set_local(self) -> None:
        scope = Scope()
        scope.set_local("name", "Alice")
        assert scope.get("name") == "Alice"

    def test_set_shared(self) -> None:
        scope = Scope(shared={})
        scope.set_shared("global", "value")
        assert scope.get("global") == "value"

    def test_set_shared_visible_to_children(self) -> None:
        parent = Scope(shared={})
        child = parent.create_child()
        parent.set_shared("global", "value")
        assert child.get("global") == "value"

    def test_create_child_inherits_shared(self) -> None:
        parent = Scope(shared={"global": "value"})
        child = parent.create_child()
        assert child.get("global") == "value"

    def test_create_child_with_variables(self) -> None:
        parent = Scope(variables={"parent_var": "parent"})
        child = parent.create_child(variables={"child_var": "child"})
        assert child.get("child_var") == "child"
        assert child.get("parent_var") == "parent"

    def test_deep_nesting(self) -> None:
        level1 = Scope(variables={"a": 1})
        level2 = level1.create_child(variables={"b": 2})
        level3 = level2.create_child(variables={"c": 3})

        assert level3.get("a") == 1
        assert level3.get("b") == 2
        assert level3.get("c") == 3
