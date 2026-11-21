from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("geoportal", "0005_archivo_subido")]

    operations = [
        migrations.AddField(model_name="alerta", name="atendida_en", field=models.DateTimeField(blank=True, null=True)),
    ]
