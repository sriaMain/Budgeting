import React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface BoardTask {
    id: string;
    assignee: string;
    assigneeAvatar: string;
    title: string;
    status: 'Planned' | 'In Progress' | 'Completed' | 'Needs Attention';
    activityType: string;
    allocatedHours: string;
    consumedHours: string;
    dueDate: string;
    remaining: string;
}

interface TaskBoardViewProps {
    tasks: BoardTask[];
    onDragEnd: (result: DropResult) => void;
    onTaskClick?: (task: BoardTask) => void;
}

const COLUMNS: BoardTask['status'][] = ['Planned', 'In Progress', 'Completed', 'Needs Attention'];

const COLUMN_COLORS: Record<BoardTask['status'], string> = {
    'Planned': 'bg-purple-50 border-purple-200',
    'In Progress': 'bg-green-50 border-green-200',
    'Completed': 'bg-blue-50 border-blue-200',
    'Needs Attention': 'bg-red-50 border-red-200',
};

const BADGE_COLORS: Record<BoardTask['status'], string> = {
    'Planned': 'bg-purple-500 text-white',
    'In Progress': 'bg-green-500 text-white',
    'Completed': 'bg-blue-500 text-white',
    'Needs Attention': 'bg-red-500 text-white',
};

const TaskCard: React.FC<{ task: BoardTask; index: number; onClick?: (task: BoardTask) => void }> = ({ task, index, onClick }) => (
    <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
            <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                onClick={() => onClick?.(task)}
                className={`bg-white rounded-lg p-3 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500 ring-opacity-50' : ''
                    }`}
            >
                <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{task.title}</p>
                    <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${task.assignee !== 'Unassigned' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400 border border-dashed border-gray-300'
                            }`}
                        title={task.assignee}
                    >
                        {task.assigneeAvatar}
                    </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">{task.activityType}</p>
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span>{task.consumedHours} / {task.allocatedHours}</span>
                    <span>{task.dueDate}</span>
                </div>
            </div>
        )}
    </Draggable>
);

export const TaskBoardView: React.FC<TaskBoardViewProps> = ({ tasks, onDragEnd, onTaskClick }) => {
    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-2">
                {COLUMNS.map((column) => {
                    const columnTasks = tasks.filter(t => t.status === column);
                    return (
                        <div key={column} className="flex-1 min-w-[260px]">
                            <div className={`${COLUMN_COLORS[column]} rounded-t-lg border-2 border-b-0 px-4 py-3 flex items-center justify-between`}>
                                <h3 className="font-semibold text-gray-900 text-sm">{column}</h3>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE_COLORS[column]}`}>
                                    {columnTasks.length}
                                </span>
                            </div>
                            <Droppable droppableId={column}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`${COLUMN_COLORS[column]} rounded-b-lg border-2 border-t-0 p-2 min-h-[300px] max-h-[calc(100vh-420px)] overflow-y-auto space-y-2 transition-colors ${snapshot.isDraggingOver ? 'ring-2 ring-inset ring-blue-300' : ''
                                            }`}
                                    >
                                        {columnTasks.length > 0 ? (
                                            columnTasks.map((task, index) => (
                                                <TaskCard key={task.id} task={task} index={index} onClick={onTaskClick} />
                                            ))
                                        ) : (
                                            <div className="text-center text-gray-400 text-xs py-8">No tasks</div>
                                        )}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    );
                })}
            </div>
        </DragDropContext>
    );
};
