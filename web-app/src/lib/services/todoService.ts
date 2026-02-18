import { supabase } from '@/lib/supabase/client';
import type {
  TodoItem,
  TodoAssignee,
  TodoCompletion,
  User,
} from '@/lib/supabase/types';

export interface TodoWithRelations extends TodoItem {
  assignees: Array<Pick<User, 'id' | 'full_name' | 'email'>>;
  completions: Array<Pick<TodoCompletion, 'user_id' | 'completed_at'>>;
}

export interface TodoInput {
  text: string;
  assigneeIds: string[];
}

export async function listTodosWithAssigneesAndCompletions(): Promise<{
  data: TodoWithRelations[] | null;
  error: Error | null;
}> {
  try {
    const { data: todos, error: todosError } = await supabase
      .from('todo_items')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (todosError) {
      return { data: null, error: todosError as Error };
    }

    const todoRows = (todos ?? []) as TodoItem[];

    if (todoRows.length === 0) {
      return { data: [], error: null };
    }

    const todoIds = todoRows.map((t) => t.id);

    const [{ data: assignees }, { data: completions }, { data: users }] =
      await Promise.all([
        supabase
          .from('todo_assignees')
          .select('*')
          .in('todo_id', todoIds),
        supabase
          .from('todo_completions')
          .select('*')
          .in('todo_id', todoIds),
        supabase
          .from('users')
          .select('id, full_name, email')
          .is('deleted_at', null),
      ]);

    const assigneeRows = (assignees ?? []) as TodoAssignee[];
    const completionRows = (completions ?? []) as TodoCompletion[];
    const userRows = (users ?? []) as User[];

    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const assigneesByTodo = new Map<string, TodoAssignee[]>();
    for (const a of assigneeRows) {
      const list = assigneesByTodo.get(a.todo_id) ?? [];
      list.push(a);
      assigneesByTodo.set(a.todo_id, list);
    }

    const completionsByTodo = new Map<string, TodoCompletion[]>();
    for (const c of completionRows) {
      const list = completionsByTodo.get(c.todo_id) ?? [];
      list.push(c);
      completionsByTodo.set(c.todo_id, list);
    }

    const result: TodoWithRelations[] = todoRows.map((t) => {
      const todoAssignees = assigneesByTodo.get(t.id) ?? [];
      const todoCompletions = completionsByTodo.get(t.id) ?? [];

      return {
        ...t,
        assignees: todoAssignees
          .map((a) => userMap.get(a.user_id))
          .filter((u): u is User => !!u)
          .map((u) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
          })),
        completions: todoCompletions.map((c) => ({
          user_id: c.user_id,
          completed_at: c.completed_at,
        })),
      };
    });

    return { data: result, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createTodoWithAssignees(
  input: TodoInput
): Promise<{ data: TodoItem | null; error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: new Error('Not authenticated') };
    }

    const { data: inserted, error: insertError } = await (supabase
      .from('todo_items')
      .insert({
        text: input.text,
        creator_id: user.id,
      } as any)
      .select('*')
      .single() as any);

    if (insertError || !inserted) {
      return { data: null, error: (insertError ?? new Error('Failed to create todo')) as Error };
    }

    const todo = inserted as TodoItem;

    if (input.assigneeIds.length > 0) {
      const { error: assigneesError } = await ((supabase
        .from('todo_assignees') as any)
        .insert(
          input.assigneeIds.map((userId) => ({
            todo_id: todo.id,
            user_id: userId,
          }))
        ));

      if (assigneesError) {
        return { data: null, error: assigneesError as Error };
      }
    }

    return { data: todo, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateTodo(
  id: string,
  input: TodoInput
): Promise<{ error: Error | null }> {
  try {
    const { error: updateError } = await ((supabase
      .from('todo_items') as any)
      .update({
        text: input.text,
      })
      .eq('id', id));

    if (updateError) {
      return { error: updateError as Error };
    }

    // Replace assignees
    const { error: deleteError } = await supabase
      .from('todo_assignees')
      .delete()
      .eq('todo_id', id);

    if (deleteError) {
      return { error: deleteError as Error };
    }

    if (input.assigneeIds.length > 0) {
      const { error: assigneesError } = await ((supabase
        .from('todo_assignees') as any)
        .insert(
          input.assigneeIds.map((userId) => ({
            todo_id: id,
            user_id: userId,
          }))
        ));

      if (assigneesError) {
        return { error: assigneesError as Error };
      }
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function deleteTodo(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await ((supabase
      .from('todo_items') as any)
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id));

    if (error) {
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function toggleTodoCompletionForUser(
  todoId: string
): Promise<{ error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: new Error('Not authenticated') };
    }

    // Ensure user is an assignee for this todo
    const { data: assignment, error: assignmentError } = await supabase
      .from('todo_assignees')
      .select('*')
      .eq('todo_id', todoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (assignmentError) {
      return { error: assignmentError as Error };
    }

    if (!assignment) {
      return { error: new Error('Only assigned users can complete this to-do') };
    }

    const { data: existing, error: existingError } = await supabase
      .from('todo_completions')
      .select('*')
      .eq('todo_id', todoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      return { error: existingError as Error };
    }

    if (existing) {
      const { error: deleteError } = await supabase
        .from('todo_completions')
        .delete()
        .eq('id', (existing as TodoCompletion).id);

      if (deleteError) {
        return { error: deleteError as Error };
      }
    } else {
      const { error: insertError } = await ((supabase
        .from('todo_completions') as any)
        .insert({
          todo_id: todoId,
          user_id: user.id,
        }));

      if (insertError) {
        return { error: insertError as Error };
      }
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

