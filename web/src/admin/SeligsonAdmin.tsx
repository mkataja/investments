import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import simpleRestProvider from "ra-data-simple-rest";
import {
  Admin,
  BooleanField,
  BooleanInput,
  Create,
  Datagrid,
  Edit,
  List,
  NumberField,
  NumberInput,
  Resource,
  SimpleForm,
  TextField,
  TextInput,
} from "react-admin";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const dataProvider = simpleRestProvider(apiUrl);
const queryClient = new QueryClient();

export function SeligsonList() {
  return (
    <List>
      <Datagrid rowClick="edit">
        <TextField source="id" />
        <NumberField source="fid" />
        <TextField source="name" />
        <BooleanField source="isActive" />
      </Datagrid>
    </List>
  );
}

export function SeligsonEdit() {
  return (
    <Edit>
      <SimpleForm>
        <NumberInput source="fid" />
        <TextInput
          source="name"
          fullWidth
          helperText="Optional — leave empty to load the name from Seligson’s FundViewer page."
        />
        <TextInput source="notes" fullWidth multiline />
        <BooleanInput source="isActive" />
      </SimpleForm>
    </Edit>
  );
}

export function SeligsonCreate() {
  return (
    <Create>
      <SimpleForm>
        <NumberInput source="fid" />
        <TextInput
          source="name"
          fullWidth
          helperText="Optional — leave empty to load the name from Seligson’s FundViewer page."
        />
        <TextInput source="notes" fullWidth multiline />
        <BooleanInput source="isActive" defaultValue />
      </SimpleForm>
    </Create>
  );
}

export function SeligsonAdmin() {
  return (
    <QueryClientProvider client={queryClient}>
      <Admin dataProvider={dataProvider} basename="/admin">
        <Resource
          name="seligson-funds"
          list={SeligsonList}
          edit={SeligsonEdit}
          create={SeligsonCreate}
        />
      </Admin>
    </QueryClientProvider>
  );
}
